const { expect }  = require("chai");
const { ethers }  = require("hardhat");

describe("ChainFund Smart Contracts", function () {
  let factory, campaign, owner, organiser, donor1, donor2, trustee1, trustee2, platform;

  beforeEach(async () => {
    [owner, organiser, donor1, donor2, trustee1, trustee2, platform] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("FundraisingFactory");
    factory = await Factory.deploy(platform.address);

    // Create a campaign
    const tx = await factory.connect(organiser).createCampaign(
      "Test Campaign",
      "A test campaign for unit testing",
      "Education",
      ethers.parseEther("1.0"),    // 1 ETH goal
      30,                            // 30 days
      [trustee1.address, trustee2.address],
      2                              // 2-of-2 multi-sig
    );
    const receipt = await tx.wait();
    const campaigns = await factory.getAllCampaigns();
    campaign = await ethers.getContractAt("FundraisingCampaign", campaigns[0]);
  });

  // ── Factory ──────────────────────────────────────────────────────────────

  describe("Factory", () => {
    it("deploys with correct platform wallet", async () => {
      expect(await factory.platformWallet()).to.equal(platform.address);
    });

    it("tracks campaign count", async () => {
      expect(await factory.getCampaignCount()).to.equal(1);
    });

    it("creates a second campaign", async () => {
      await factory.connect(donor1).createCampaign("Camp 2","Desc","Healthcare",ethers.parseEther("0.5"),10,[donor1.address],1);
      expect(await factory.getCampaignCount()).to.equal(2);
    });
  });

  // ── Campaign Info ─────────────────────────────────────────────────────────

  describe("Campaign Setup", () => {
    it("stores correct organiser", async () => {
      const info = await campaign.getCampaignInfo();
      expect(info._organiser).to.equal(organiser.address);
    });

    it("stores correct goal amount", async () => {
      const info = await campaign.getCampaignInfo();
      expect(info._goalAmount).to.equal(ethers.parseEther("1.0"));
    });

    it("starts as active", async () => {
      expect(await campaign.active()).to.equal(true);
    });
  });

  // ── Donations ─────────────────────────────────────────────────────────────

  describe("Donations", () => {
    it("accepts ETH donation", async () => {
      await campaign.connect(donor1).donate({ value: ethers.parseEther("0.1") });
      expect(await campaign.totalRaised()).to.equal(ethers.parseEther("0.1"));
    });

    it("tracks multiple donors", async () => {
      await campaign.connect(donor1).donate({ value: ethers.parseEther("0.2") });
      await campaign.connect(donor2).donate({ value: ethers.parseEther("0.3") });
      expect(await campaign.getDonorCount()).to.equal(2);
    });

    it("marks goalReached when goal is met", async () => {
      await campaign.connect(donor1).donate({ value: ethers.parseEther("1.0") });
      expect(await campaign.goalReached()).to.equal(true);
    });

    it("emits DonationReceived event", async () => {
      await expect(campaign.connect(donor1).donate({ value: ethers.parseEther("0.1") }))
        .to.emit(campaign, "DonationReceived")
        .withArgs(donor1.address, ethers.parseEther("0.1"), await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
    });

    it("rejects zero-value donations", async () => {
      await expect(campaign.connect(donor1).donate({ value: 0 }))
        .to.be.revertedWith("Must send ETH");
    });
  });

  // ── Milestones & Multi-Sig ────────────────────────────────────────────────

  describe("Milestones", () => {
    beforeEach(async () => {
      // Fund the campaign
      await campaign.connect(donor1).donate({ value: ethers.parseEther("1.0") });
      // Add a milestone
      await campaign.connect(organiser).addMilestone("Phase 1: Infrastructure", ethers.parseEther("0.4"));
    });

    it("allows organiser to add milestones", async () => {
      expect(await campaign.getMilestoneCount()).to.equal(1);
    });

    it("requires all trustees to approve before disbursement", async () => {
      // First trustee approves
      await campaign.connect(trustee1).approveMilestone(0);
      const [,,,completed,approvalCount] = await campaign.getMilestone(0);
      expect(completed).to.equal(false);
      expect(approvalCount).to.equal(1);
    });

    it("disburses on full multi-sig approval", async () => {
      const organiserBalanceBefore = await ethers.provider.getBalance(organiser.address);

      await campaign.connect(trustee1).approveMilestone(0);
      await campaign.connect(trustee2).approveMilestone(0);

      const [,,,completed] = await campaign.getMilestone(0);
      expect(completed).to.equal(true);

      // Organiser should have received funds (minus platform fee)
      const organiserBalanceAfter = await ethers.provider.getBalance(organiser.address);
      expect(organiserBalanceAfter).to.be.gt(organiserBalanceBefore);
    });

    it("prevents double approval by same trustee", async () => {
      await campaign.connect(trustee1).approveMilestone(0);
      await expect(campaign.connect(trustee1).approveMilestone(0))
        .to.be.revertedWith("Already approved");
    });

    it("prevents non-trustees from approving", async () => {
      await expect(campaign.connect(donor1).approveMilestone(0))
        .to.be.revertedWith("Not a trustee");
    });

    it("platform receives 2% fee on disbursement", async () => {
      const platformBefore = await ethers.provider.getBalance(platform.address);
      await campaign.connect(trustee1).approveMilestone(0);
      await campaign.connect(trustee2).approveMilestone(0);
      const platformAfter = await ethers.provider.getBalance(platform.address);
      // 2% of 0.4 ETH = 0.008 ETH
      expect(platformAfter - platformBefore).to.equal(ethers.parseEther("0.008"));
    });
  });

  // ── Refunds ───────────────────────────────────────────────────────────────

  describe("Refunds", () => {
    it("allows refund after deadline if goal not met", async () => {
      await campaign.connect(donor1).donate({ value: ethers.parseEther("0.1") });

      // Fast-forward time past deadline
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]); // 31 days
      await ethers.provider.send("evm_mine", []);

      const balanceBefore = await ethers.provider.getBalance(donor1.address);
      const tx = await campaign.connect(donor1).claimRefund();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(donor1.address);

      expect(balanceAfter + gasUsed - balanceBefore).to.equal(ethers.parseEther("0.1"));
    });

    it("prevents refund if goal was reached", async () => {
      await campaign.connect(donor1).donate({ value: ethers.parseEther("1.0") });
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await expect(campaign.connect(donor1).claimRefund())
        .to.be.revertedWith("Refund not available");
    });

    it("prevents double refund", async () => {
      await campaign.connect(donor1).donate({ value: ethers.parseEther("0.1") });
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      await campaign.connect(donor1).claimRefund();
      await expect(campaign.connect(donor1).claimRefund())
        .to.be.revertedWith("Already refunded");
    });
  });
});
