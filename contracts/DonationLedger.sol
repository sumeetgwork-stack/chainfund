// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DonationLedger
 * @dev Records cryptographic proofs of fiat (INR/USD) donations on-chain.
 *      Enables public verification without exposing personal data.
 *      Only the platform backend (owner) can record entries.
 */
contract DonationLedger {

    // ─── State ───────────────────────────────────────────────────────────────

    struct FiatDonation {
        bytes32 proofHash;       // SHA-256 hash of donation details
        address campaign;        // Campaign contract address
        uint256 amountPaise;     // Amount in smallest unit (paise for INR, cents for USD)
        string  currency;        // "INR" or "USD"
        uint256 timestamp;       // Block timestamp when recorded
        bool    verified;        // Set to true after Razorpay webhook confirms
    }

    address public owner;
    FiatDonation[] public donations;
    uint256 public totalRecorded;
    uint256 public totalAmountINR;   // Running total in paise

    // Mapping: Razorpay payment ID hash → donation index (prevents duplicates)
    mapping(bytes32 => bool) public paymentRecorded;

    // ─── Events ──────────────────────────────────────────────────────────────

    event FiatDonationRecorded(
        uint256 indexed donationId,
        bytes32 indexed proofHash,
        address indexed campaign,
        uint256 amountPaise,
        string  currency,
        uint256 timestamp
    );

    event DonationVerified(uint256 indexed donationId);

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "DonationLedger: not owner");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Core Functions ──────────────────────────────────────────────────────

    /**
     * @dev Record a fiat donation proof on-chain
     * @param _proofHash SHA-256 hash of: paymentId + campaignAddress + amount + timestamp
     * @param _paymentIdHash Hash of the Razorpay payment ID (for duplicate prevention)
     * @param _campaign Address of the associated campaign contract
     * @param _amountPaise Amount in paise (₹500 = 50000 paise)
     * @param _currency Currency code ("INR" or "USD")
     * @return donationId The index of the recorded donation
     */
    function recordDonation(
        bytes32 _proofHash,
        bytes32 _paymentIdHash,
        address _campaign,
        uint256 _amountPaise,
        string calldata _currency
    ) external onlyOwner returns (uint256) {
        require(!paymentRecorded[_paymentIdHash], "DonationLedger: already recorded");
        require(_amountPaise > 0, "DonationLedger: amount must be > 0");

        paymentRecorded[_paymentIdHash] = true;

        uint256 donationId = donations.length;
        donations.push(FiatDonation({
            proofHash:   _proofHash,
            campaign:    _campaign,
            amountPaise: _amountPaise,
            currency:    _currency,
            timestamp:   block.timestamp,
            verified:    true
        }));

        totalRecorded++;
        totalAmountINR += _amountPaise;

        emit FiatDonationRecorded(
            donationId,
            _proofHash,
            _campaign,
            _amountPaise,
            _currency,
            block.timestamp
        );

        return donationId;
    }

    // ─── Verification ────────────────────────────────────────────────────────

    /**
     * @dev Verify a donation's proof hash matches
     * @param _donationId Index of the donation
     * @param _hash Hash to compare against
     * @return matches True if the hash matches the recorded proof
     */
    function verifyDonation(uint256 _donationId, bytes32 _hash) external view returns (bool) {
        require(_donationId < donations.length, "DonationLedger: invalid ID");
        return donations[_donationId].proofHash == _hash;
    }

    /**
     * @dev Check if a payment has already been recorded
     */
    function isPaymentRecorded(bytes32 _paymentIdHash) external view returns (bool) {
        return paymentRecorded[_paymentIdHash];
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getDonationCount() external view returns (uint256) {
        return donations.length;
    }

    function getDonation(uint256 _id) external view returns (
        bytes32 proofHash,
        address campaign,
        uint256 amountPaise,
        string memory currency,
        uint256 timestamp,
        bool    verified
    ) {
        require(_id < donations.length, "DonationLedger: invalid ID");
        FiatDonation storage d = donations[_id];
        return (d.proofHash, d.campaign, d.amountPaise, d.currency, d.timestamp, d.verified);
    }

    /**
     * @dev Get donations for a specific campaign (returns IDs only for gas efficiency)
     */
    function getCampaignDonationIds(address _campaign) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < donations.length; i++) {
            if (donations[i].campaign == _campaign) count++;
        }

        uint256[] memory ids = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < donations.length; i++) {
            if (donations[i].campaign == _campaign) {
                ids[idx] = i;
                idx++;
            }
        }
        return ids;
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "DonationLedger: zero address");
        owner = _newOwner;
    }
}
