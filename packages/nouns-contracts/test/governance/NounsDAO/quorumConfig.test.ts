import chai from 'chai';
import { solidity } from 'ethereum-waffle';
import hardhat from 'hardhat';
const { ethers } = hardhat;
import {
  deployNounsToken,
  getSigners,
  TestSigners,
  setTotalSupply,
  populateDescriptor,
} from '../../utils';
import { address } from '../../utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  NounsToken,
  NounsDescriptor__factory as NounsDescriptorFactory,
  NounsDaoLogicV1Harness,
  NounsDaoLogicV1Harness__factory as NounsDaoLogicV1HarnessFactory,
  NounsDaoLogicV2Harness,
  NounsDaoLogicV2Harness__factory as NounsDaoLogicV2HarnessFactory,
  NounsDaoProxy__factory as NounsDaoProxyFactory,
} from '../../../typechain';

chai.use(solidity);
const { expect } = chai;

const MIN_QUORUM_VOTES_BPS = 200;
const MAX_QUORUM_VOTES_BPS = 1900;

async function deployGovernorV1(
  deployer: SignerWithAddress,
  tokenAddress: string,
): Promise<NounsDaoLogicV1Harness> {
  const { address: govDelegateAddress } = await new NounsDaoLogicV1HarnessFactory(
    deployer,
  ).deploy();
  const params = [
    address(0),
    tokenAddress,
    deployer.address,
    deployer.address,
    govDelegateAddress,
    1728,
    1,
    1,
    MIN_QUORUM_VOTES_BPS,
  ];

  const { address: _govDelegatorAddress } = await (
    await ethers.getContractFactory('NounsDAOProxy', deployer)
  ).deploy(...params);

  return NounsDaoLogicV1HarnessFactory.connect(_govDelegatorAddress, deployer);
}

async function deployGovernorV2(
  deployer: SignerWithAddress,
  tokenAddress: string,
  proxyAddress: string,
): Promise<NounsDaoLogicV2Harness> {
  const v2LogicContract = await new NounsDaoLogicV2HarnessFactory(deployer).deploy();
  const proxy = NounsDaoProxyFactory.connect(proxyAddress, deployer);
  await proxy._setImplementation(v2LogicContract.address);

  const govV2 = NounsDaoLogicV2HarnessFactory.connect(proxyAddress, deployer);

  await govV2.initialize(
    address(0),
    tokenAddress,
    deployer.address,
    1728,
    1,
    1,
    MIN_QUORUM_VOTES_BPS,
    MAX_QUORUM_VOTES_BPS,
    [0, 0, 0, 0],
  );

  return govV2;
}

let token: NounsToken;
let deployer: SignerWithAddress;
let account0: SignerWithAddress;
let signers: TestSigners;
let gov: NounsDaoLogicV2Harness;

async function setupWithV2() {
  token = await deployNounsToken(signers.deployer);

  await populateDescriptor(
    NounsDescriptorFactory.connect(await token.descriptor(), signers.deployer),
  );

  await setTotalSupply(token, 100);

  const { address: govProxyAddress } = await deployGovernorV1(deployer, token.address);
  gov = await deployGovernorV2(deployer, token.address, govProxyAddress);
}

describe('NounsDAO#quorumConfig', () => {
  before(async () => {
    signers = await getSigners();
    deployer = signers.deployer;
    account0 = signers.account0;

    await setupWithV2();
  });

  describe('_setMinQuorumVotesBPS', async () => {
    it('reverts when sender is not admin', async () => {
      await expect(gov.connect(account0)._setMinQuorumVotesBPS(234)).to.be.revertedWith(
        'NounsDAO::_setMinQuorumVotesBPS: admin only',
      );
    });

    it('reverts given input below lower bound', async () => {
      await expect(gov._setMinQuorumVotesBPS(1)).to.be.revertedWith(
        'NounsDAO::_setMinQuorumVotesBPS: invalid min quorum votes bps',
      );
    });

    it('reverts given input above upper bound', async () => {
      await expect(gov._setMinQuorumVotesBPS(2345)).to.be.revertedWith(
        'NounsDAO::_setMinQuorumVotesBPS: invalid min quorum votes bps',
      );
    });

    it('reverts given input above max BPs', async () => {
      await expect(gov._setMinQuorumVotesBPS(MAX_QUORUM_VOTES_BPS + 12)).to.be.revertedWith(
        'NounsDAO::_setMinQuorumVotesBPS: min quorum votes bps greater than max',
      );
    });

    it('sets value and emits event', async () => {
      const tx = await gov._setMinQuorumVotesBPS(234);

      expect(await gov.minQuorumVotesBPS()).to.equal(234);
      await expect(tx).to.emit(gov, 'MinQuorumVotesBPSSet').withArgs(MIN_QUORUM_VOTES_BPS, 234);
    });
  });

  describe('_setMaxQuorumVotesBPS', async () => {
    it('reverts when sender is not admin', async () => {
      await expect(gov.connect(account0)._setMaxQuorumVotesBPS(2345)).to.be.revertedWith(
        'NounsDAO::_setMaxQuorumVotesBPS: admin only',
      );
    });

    it('reverts when input below min quorum', async () => {
      await expect(gov._setMaxQuorumVotesBPS(123)).to.be.revertedWith(
        'NounsDAO::_setMaxQuorumVotesBPS: invalid max quorum votes bps',
      );
    });

    it('reverts when input above upper bound', async () => {
      await expect(gov._setMaxQuorumVotesBPS(4321)).to.be.revertedWith(
        'NounsDAO::_setMaxQuorumVotesBPS: invalid max quorum votes bps',
      );
    });

    it('sets value and emits event', async () => {
      const tx = await gov._setMaxQuorumVotesBPS(2345);

      expect(await gov.maxQuorumVotesBPS()).to.equal(2345);
      await expect(tx).to.emit(gov, 'MaxQuorumVotesBPSSet').withArgs(MAX_QUORUM_VOTES_BPS, 2345);
    });
  });
});