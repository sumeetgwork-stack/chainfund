// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FundraisingCampaign
 * @dev Individual campaign contract with escrow, milestones, multi-sig, and auto-refund
 */
contract FundraisingCampaign {
    // ─── State ───────────────────────────────────────────────────────────────

    struct Milestone {
        string  description;
        uint256 targetAmount;    // ETH required to unlock this milestone
        uint256 releasedAmount;
        bool    completed;
        uint256 approvalCount;
        mapping(address => bool) approved;
    }

    struct Donor {
        uint256 totalDonated;
        bool    refunded;
    }

    address public factory;
    address public organiser;
    string  public title;
    string  public description;
    string  public category;
    uint256 public goalAmount;      // in wei
    uint256 public deadline;
    uint256 public totalRaised;
    uint256 public totalDisbursed;
    bool    public active;
    bool    public goalReached;

    address[]  public trustees;          // multi-sig approvers
    uint256    public requiredApprovals; // e.g. 3 of 5

    Milestone[] public milestones;
    mapping(address => Donor) public donors;
    address[] public donorList;

    uint256 public constant PLATFORM_FEE_BPS = 200; // 2%
    address public platformWallet;

    // ─── Events ──────────────────────────────────────────────────────────────

    event DonationReceived(address indexed donor, uint256 amount, uint256 timestamp);
    event MilestoneApproved(uint256 indexed milestoneId, address indexed trustee);
    event FundsDisbursed(uint256 indexed milestoneId, address indexed recipient, uint256 amount);
    event RefundIssued(address indexed donor, uint256 amount);
    event CampaignCompleted(uint256 totalRaised, uint256 totalDisbursed);

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOrganiser() {
        require(msg.sender == organiser, "Not organiser");
        _;
    }

    modifier onlyTrustee() {
        require(isTrustee(msg.sender), "Not a trustee");
        _;
    }

    modifier isActive() {
        require(active, "Campaign not active");
        require(block.timestamp < deadline, "Campaign expired");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _organiser,
        string memory _title,
        string memory _description,
        string memory _category,
        uint256 _goalAmount,
        uint256 _durationDays,
        address[] memory _trustees,
        uint256 _requiredApprovals,
        address _platformWallet
    ) {
        require(_trustees.length >= _requiredApprovals, "Not enough trustees");
        require(_requiredApprovals > 0, "Need at least 1 approval");

        factory            = msg.sender;
        organiser          = _organiser;
        title              = _title;
        description        = _description;
        category           = _category;
        goalAmount         = _goalAmount;
        deadline           = block.timestamp + (_durationDays * 1 days);
        trustees           = _trustees;
        requiredApprovals  = _requiredApprovals;
        platformWallet     = _platformWallet;
        active             = true;
    }

    // ─── Donation ─────────────────────────────────────────────────────────────

    function donate() external payable isActive {
        require(msg.value > 0, "Must send ETH");

        if (donors[msg.sender].totalDonated == 0) {
            donorList.push(msg.sender);
        }
        donors[msg.sender].totalDonated += msg.value;
        totalRaised += msg.value;

        if (totalRaised >= goalAmount) {
            goalReached = true;
        }

        emit DonationReceived(msg.sender, msg.value, block.timestamp);
    }

    // ─── Milestones ──────────────────────────────────────────────────────────

    function addMilestone(string calldata _desc, uint256 _targetAmount) external onlyOrganiser {
        require(active, "Campaign not active");
        Milestone storage m = milestones.push();
        m.description   = _desc;
        m.targetAmount  = _targetAmount;
        m.completed     = false;
        m.approvalCount = 0;
    }

    function approveMilestone(uint256 _milestoneId) external onlyTrustee {
        require(_milestoneId < milestones.length, "Invalid milestone");
        Milestone storage m = milestones[_milestoneId];
        require(!m.completed, "Already completed");
        require(!m.approved[msg.sender], "Already approved");

        m.approved[msg.sender] = true;
        m.approvalCount++;

        emit MilestoneApproved(_milestoneId, msg.sender);

        if (m.approvalCount >= requiredApprovals) {
            _disburseMilestone(_milestoneId);
        }
    }

    function _disburseMilestone(uint256 _milestoneId) internal {
        Milestone storage m = milestones[_milestoneId];
        require(!m.completed, "Already disbursed");

        uint256 amount = m.targetAmount;
        require(address(this).balance >= amount, "Insufficient contract balance");

        // Deduct platform fee
        uint256 fee     = (amount * PLATFORM_FEE_BPS) / 10000;
        uint256 netAmt  = amount - fee;

        m.completed      = true;
        m.releasedAmount = amount;
        totalDisbursed  += amount;

        payable(platformWallet).transfer(fee);
        payable(organiser).transfer(netAmt);

        emit FundsDisbursed(_milestoneId, organiser, netAmt);
    }

    // ─── Direct Disbursement (no milestones) ─────────────────────────────────

    function requestDisbursement(address payable _recipient, uint256 _amount)
        external onlyOrganiser
    {
        require(goalReached, "Goal not reached");
        require(address(this).balance >= _amount, "Insufficient funds");

        uint256 fee    = (_amount * PLATFORM_FEE_BPS) / 10000;
        uint256 netAmt = _amount - fee;

        totalDisbursed += _amount;

        payable(platformWallet).transfer(fee);
        _recipient.transfer(netAmt);

        emit FundsDisbursed(999, _recipient, netAmt);
    }

    // ─── Refunds ─────────────────────────────────────────────────────────────

    function claimRefund() external {
        require(
            block.timestamp > deadline && !goalReached,
            "Refund not available"
        );
        Donor storage d = donors[msg.sender];
        require(d.totalDonated > 0, "No donation found");
        require(!d.refunded, "Already refunded");

        uint256 refundAmt = d.totalDonated;
        d.refunded = true;

        payable(msg.sender).transfer(refundAmt);
        emit RefundIssued(msg.sender, refundAmt);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function closeCampaign() external onlyOrganiser {
        active = false;
        emit CampaignCompleted(totalRaised, totalDisbursed);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function isTrustee(address _addr) public view returns (bool) {
        for (uint i = 0; i < trustees.length; i++) {
            if (trustees[i] == _addr) return true;
        }
        return false;
    }

    function getMilestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    function getMilestone(uint256 id) external view returns (
        string memory desc,
        uint256 targetAmount,
        uint256 releasedAmount,
        bool completed,
        uint256 approvalCount
    ) {
        Milestone storage m = milestones[id];
        return (m.description, m.targetAmount, m.releasedAmount, m.completed, m.approvalCount);
    }

    function getDonorCount() external view returns (uint256) {
        return donorList.length;
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getCampaignInfo() external view returns (
        address _organiser,
        string memory _title,
        string memory _category,
        uint256 _goalAmount,
        uint256 _totalRaised,
        uint256 _totalDisbursed,
        uint256 _deadline,
        bool _active,
        bool _goalReached,
        uint256 _balance
    ) {
        return (
            organiser,
            title,
            category,
            goalAmount,
            totalRaised,
            totalDisbursed,
            deadline,
            active,
            goalReached,
            address(this).balance
        );
    }

    receive() external payable {
        // Accept ETH directly (same as donate)
        if (active && block.timestamp < deadline) {
            if (donors[msg.sender].totalDonated == 0) donorList.push(msg.sender);
            donors[msg.sender].totalDonated += msg.value;
            totalRaised += msg.value;
            if (totalRaised >= goalAmount) goalReached = true;
            emit DonationReceived(msg.sender, msg.value, block.timestamp);
        }
    }
}
