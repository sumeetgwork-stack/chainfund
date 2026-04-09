// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./FundraisingCampaign.sol";

/**
 * @title FundraisingFactory
 * @dev Deploys and tracks all campaign contracts on-chain
 */
contract FundraisingFactory {
    address public owner;
    address public platformWallet;

    address[] public allCampaigns;
    mapping(address => address[]) public campaignsByOrganiser;
    mapping(address => bool) public authorizedOrganisers;

    event CampaignCreated(
        address indexed campaignAddress,
        address indexed organiser,
        string  title,
        string  category,
        uint256 goalAmount,
        uint256 deadline,
        uint256 timestamp
    );

    event OrganiserAuthorized(address indexed organiser, bool status);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedOrganisers[msg.sender] || msg.sender == owner, "Not an authorized organiser");
        _;
    }

    constructor(address _platformWallet) {
        owner          = msg.sender;
        platformWallet = _platformWallet;
    }

    function setOrganiserAuthorization(address _organiser, bool _status) external onlyOwner {
        authorizedOrganisers[_organiser] = _status;
        emit OrganiserAuthorized(_organiser, _status);
    }

    function createCampaign(
        string  calldata _title,
        string  calldata _description,
        string  calldata _category,
        uint256 _goalAmount,
        uint256 _durationDays,
        address[] calldata _trustees,
        uint256 _requiredApprovals
    ) external onlyAuthorized returns (address) {
        require(_goalAmount > 0,      "Goal must be > 0");
        require(_durationDays > 0,    "Duration must be > 0");
        require(_durationDays <= 365, "Max 365 days");

        FundraisingCampaign campaign = new FundraisingCampaign(
            msg.sender,
            _title,
            _description,
            _category,
            _goalAmount,
            _durationDays,
            _trustees,
            _requiredApprovals,
            platformWallet
        );

        address addr = address(campaign);
        allCampaigns.push(addr);
        campaignsByOrganiser[msg.sender].push(addr);

        emit CampaignCreated(
            addr,
            msg.sender,
            _title,
            _category,
            _goalAmount,
            block.timestamp + (_durationDays * 1 days),
            block.timestamp
        );

        return addr;
    }

    function getCampaignCount() external view returns (uint256) {
        return allCampaigns.length;
    }

    function getAllCampaigns() external view returns (address[] memory) {
        return allCampaigns;
    }

    function getOrgCampaigns(address organiser) external view returns (address[] memory) {
        return campaignsByOrganiser[organiser];
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        platformWallet = _wallet;
    }
}
