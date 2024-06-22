const Web3 = require('web3');
const swap_ABI = require('./abi/weth_abi');
require('dotenv').config();

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.WALLET_PRIVATEKEY;
const contractAddress = process.env.WETH_CA;

const web3 = new Web3(rpcUrl);
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);

const wethContract = new web3.eth.Contract(swap_ABI, contractAddress);

// Shared Variables
let totalGasSpentWithdrawal = 0;
let totalWETHBalanceWithdrawal = 0;
let totalGasSpentDeposit = 0;
let totalWETHBalanceDeposit = 0;

// Withdrawal Variables
let totalAmountWithdrew = 0;
let jumpIndex = 0;

// Deposit Variables
let totalAmountDeposited = 0;

//===================================//
// Common Functions
function formatDateToTimezone(date, timeZone) {
  const timeOptions = {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone: timeZone
  };
  const timeFormatter = new Intl.DateTimeFormat('en-US', timeOptions);
  const formattedTime = timeFormatter.format(date);

  const dateOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timeZone
  };
  const dateFormatter = new Intl.DateTimeFormat('en-US', dateOptions);
  const formattedDate = dateFormatter.format(date);

  return `${formattedTime} · ${formattedDate}`;
}

function getRandomAmount(min, max) {
  const randomValue = Math.random() * (max - min) + min;
  const roundedValue = randomValue.toFixed(8);
  return roundedValue.toString();
}

function getRandomTimeOut(min, max) {
  const randomValue = Math.floor(Math.random() * (max - min)) + min;
  return randomValue;
}

//===================================//
// Withdrawal Functions
async function withdrawETH(sendIndex) {
  const wethBalance = await wethContract.methods.balanceOf(account.address).call();
  const initialWETHBalance = parseInt(wethBalance);

  const gasLimit = parseInt(process.env.GAS_LIMIT);
  const randomAmount = getRandomAmount(
    parseFloat(process.env.WITHDRAW_RANDOM_AMOUNT_MIN),
    parseFloat(process.env.WITHDRAW_RANDOM_AMOUNT_MAX)
  );
  const amountToWithdraw = randomAmount + '0000000000';
  let valueToWithdraw = parseInt(amountToWithdraw);

  if (initialWETHBalance <= valueToWithdraw) {
    valueToWithdraw = initialWETHBalance;
    jumpIndex = 50;
  }

  if (initialWETHBalance === 0) {
    finalizeWithdrawalTransaction();
    return;
  }

  const withETH = wethContract.methods.withdraw(valueToWithdraw).encodeABI();
  const transactionObject = {
    from: account.address,
    to: contractAddress,
    value: 0,
    maxPriorityFeePerGas: web3.utils.toHex(web3.utils.toWei(process.env.MAX_PRIORITY_FEE_PER_GAS, "gwei")),
    maxFeePerGas: web3.utils.toHex(web3.utils.toWei(process.env.MAX_FEE_PER_GAS, "gwei")),
    type: 2,
    chainId: 167000,
    data: withETH,
    gasLimit: web3.utils.toHex(gasLimit)
  };

  const amountSent = web3.utils.fromWei(valueToWithdraw.toString(), 'ether');
  totalAmountWithdrew += parseFloat(amountSent);

  try {
    const transactionReceipt = await web3.eth.sendTransaction(transactionObject);
    totalGasSpentWithdrawal += parseFloat(web3.utils.fromWei((transactionReceipt.gasUsed * transactionReceipt.effectiveGasPrice).toString(), 'ether'));

    const blockNumber = transactionReceipt.blockNumber;
    const blockDetails = await web3.eth.getBlock(blockNumber);
    const timestamp = blockDetails.timestamp;
    const date = new Date(timestamp * 1000);
    const formattedDate = formatDateToTimezone(date, 'Asia/Manila');

    console.log(`\n${sendIndex + 1}. \x1b[91m${amountSent}\x1b[0m ETH withdrawal success @ \x1b[93m${formattedDate}\x1b[0m with Block # \x1b[32m${blockNumber}\x1b[0m`);
    console.log(`   Transaction hash: \x1b[96m${transactionReceipt.transactionHash}\x1b[0m`);
    console.log(`   Transaction details -> \x1b[1;94mhttps://taikoscan.network/tx/${transactionReceipt.transactionHash}\x1b[0m`);

    const wethBalance = await wethContract.methods.balanceOf(account.address).call();
    totalWETHBalanceWithdrawal = parseFloat(web3.utils.fromWei((wethBalance).toString(), 'ether'));
    console.log('\nTotal WETH balance (Withdrawal): \x1b[95m' + totalWETHBalanceWithdrawal.toFixed(8) + '\x1b[0m WETH');
  } catch (withdrawError) {
    console.error(`Error withdrawing ETH:`, withdrawError);
  }

  let sendIndexNew = sendIndex + jumpIndex + 1;
  let txCount = parseInt(process.env.WITHDRAW_TX_COUNT);

  if (sendIndexNew >= txCount) {
    finalizeWithdrawalTransaction();
    return;
  }

  const randomTimeOut = getRandomTimeOut(
    parseInt(process.env.WITHDRAW_RANDOM_TIME_MIN),
    parseInt(process.env.WITHDRAW_RANDOM_TIME_MAX)
  );

  setTimeout(() => {
    withdrawETH(sendIndexNew);
  }, randomTimeOut);
}

async function finalizeWithdrawalTransaction() {
  console.log('\n\x1b[94mAll withdrawal transactions completed.\x1b[0m');
  console.log('Overall ETH withdrawal: \x1b[91m' + totalAmountWithdrew.toFixed(8) + '\x1b[0m ETH');
  console.log('Overall txn fee spent (Withdrawal): \x1b[93m' + totalGasSpentWithdrawal.toFixed(10) + '\x1b[0m ETH');

  const wethBalance = await wethContract.methods.balanceOf(account.address).call();
  totalWETHBalanceWithdrawal = parseFloat(web3.utils.fromWei((wethBalance).toString(), 'ether'));
  console.log('\nOverall WETH balance (Withdrawal): \x1b[95m' + totalWETHBalanceWithdrawal.toFixed(8) + '\x1b[0m WETH');

  const queryRemainingBalance = await web3.eth.getBalance(account.address);
  const remainingBalance = parseFloat(web3.utils.fromWei(queryRemainingBalance, 'ether')).toFixed(8);
  console.log('Overall ETH balance: \x1b[92m' + remainingBalance + '\x1b[0m ETH');
}

//===================================//
// Deposit Functions
async function depositETH(sendIndex) {
  const gasLimit = parseInt(process.env.GAS_LIMIT);
  const randomAmount = getRandomAmount(
    parseFloat(process.env.DEPOSIT_RANDOM_AMOUNT_MIN),
    parseFloat(process.env.DEPOSIT_RANDOM_AMOUNT_MAX)
  );
  const amountToDeposit = web3.utils.toWei(randomAmount, 'ether');
  const valueToDeposit = parseFloat(amountToDeposit);

  const depETH = wethContract.methods.deposit().encodeABI();
  const transactionObject = {
    from: account.address,
    to: contractAddress,
    value: valueToDeposit,
    maxPriorityFeePerGas: web3.utils.toHex(web3.utils.toWei(process.env.MAX_PRIORITY_FEE_PER_GAS, "gwei")),
    maxFeePerGas: web3.utils.toHex(web3.utils.toWei(process.env.MAX_FEE_PER_GAS, "gwei")),
    type: 2,
    chainId: 167000,
    data: depETH,
    gasLimit: web3.utils.toHex(gasLimit)
  };

  const amountSent = web3.utils.fromWei(amountToDeposit, 'ether');
  totalAmountDeposited += parseFloat(amountSent);

  try {
    const transactionReceipt = await web3.eth.sendTransaction(transactionObject);
    totalGasSpentDeposit += parseFloat(web3.utils.fromWei((transactionReceipt.gasUsed * transactionReceipt.effectiveGasPrice).toString(), 'ether'));

    const blockNumber = transactionReceipt.blockNumber;
    const blockDetails = await web3.eth.getBlock(blockNumber);
    const timestamp = blockDetails.timestamp;
    const date = new Date(timestamp * 1000);
    const formattedDate = formatDateToTimezone(date, 'Asia/Manila');

    console.log(`\n${sendIndex + 1}. \x1b[91m${amountSent}\x1b[0m ETH deposit success @ \x1b[93m${formattedDate}\x1b[0m with Block # \x1b[32m${blockNumber}\x1b[0m`);
    console.log(`   Transaction hash: \x1b[96m${transactionReceipt.transactionHash}\x1b[0m`);
    console.log(`   Transaction details -> \x1b[1;94mhttps://taikoscan.network/tx/${transactionReceipt.transactionHash}\x1b[0m`);

    const wethBalance = await wethContract.methods.balanceOf(account.address).call();
    totalWETHBalanceDeposit = parseFloat(web3.utils.fromWei((wethBalance).toString(), 'ether'));
    console.log('\nTotal WETH balance (Deposit): \x1b[95m' + totalWETHBalanceDeposit.toFixed(8) + '\x1b[0m WETH');
  } catch (depositError) {
    console.error(`Error depositing ETH:`, depositError);
  }

  let sendIndexNew = sendIndex + 1;
  let txCount = parseInt(process.env.DEPOSIT_TX_COUNT);

  if (sendIndexNew >= txCount) {
    finalizeDepositTransaction();
    return;
  }

  const randomTimeOut = getRandomTimeOut(
    parseInt(process.env.DEPOSIT_RANDOM_TIME_MIN),
    parseInt(process.env.DEPOSIT_RANDOM_TIME_MAX)
  );

  setTimeout(() => {
    depositETH(sendIndexNew);
  }, randomTimeOut);
}

async function finalizeDepositTransaction() {
  console.log('\n\x1b[94mAll deposit transactions completed.\x1b[0m');
  console.log('Overall ETH deposit: \x1b[91m' + totalAmountDeposited.toFixed(8) + '\x1b[0m ETH');
  console.log('Overall txn fee spent (Deposit): \x1b[93m' + totalGasSpentDeposit.toFixed(10) + '\x1b[0m ETH');

  const wethBalance = await wethContract.methods.balanceOf(account.address).call();
  totalWETHBalanceDeposit = parseFloat(web3.utils.fromWei((wethBalance).toString(), 'ether'));
  console.log('\nOverall WETH balance (Deposit): \x1b[95m' + totalWETHBalanceDeposit.toFixed(8) + '\x1b[0m WETH');

  const queryRemainingBalance = await web3.eth.getBalance(account.address);
  const remainingBalance = parseFloat(web3.utils.fromWei(queryRemainingBalance, 'ether')).toFixed(8);
  console.log('Overall ETH balance: \x1b[92m' + remainingBalance + '\x1b[0m ETH');
}

//===================================//
// Main Execution
async function main() {
  try {
    await Promise.all([
      withdrawETH(0),
      depositETH(0)
    ]);

    // After both withdrawal and deposit are done
    finalizeWithdrawalTransaction();
    finalizeDepositTransaction();
  } catch (error) {
    console.error('Error during execution:', error);
  }
}

main();
