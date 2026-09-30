const contractAddress = "0xEc7F1BA9cF3B8287D9CEFe3fd608EdC919bAA653";
const contractABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_itemId",
        "type": "uint256"
      }
    ],
    "name": "buyItem",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_itemId",
        "type": "uint256"
      }
    ],
    "name": "confirmDelivery",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_name",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "_price",
        "type": "uint256"
      }
    ],
    "name": "listItem",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_itemId",
        "type": "uint256"
      }
    ],
    "name": "refundBuyer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "itemCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "items",
    "outputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      },
      {
        "internalType": "address payable",
        "name": "seller",
        "type": "address"
      },
      {
        "internalType": "address payable",
        "name": "buyer",
        "type": "address"
      },
      {
        "internalType": "enum MarketplaceEscrow.ItemState",
        "name": "state",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

let provider;
let signer;
let contract;
let userAddress;

const connectWalletBtn = document.getElementById('connectWalletBtn');
const productList = document.getElementById('productList');
const addProductForm = document.getElementById('addProductForm');

// Connect to MetaMask
async function connectWallet() {
    if (window.ethereum) {
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            userAddress = await signer.getAddress();
            
            contract = new ethers.Contract(contractAddress, contractABI, signer);
            
            connectWalletBtn.innerText = userAddress.substring(0, 6) + "..." + userAddress.substring(38);
            connectWalletBtn.style.backgroundColor = "var(--success-green)";
            connectWalletBtn.style.color = "var(--text-dark)";
            connectWalletBtn.style.border = "none";
        } catch (error) {
            console.error("User rejected request", error);
        }
    } else {
        alert("Please install MetaMask!");
    }
}

connectWalletBtn.addEventListener('click', connectWallet);

// Fetch products and render advanced UI cards
async function fetchProducts() {
    const response = await fetch('https://escrow-market-xmi8.onrender.com/api/products', {
        cache: 'no-store' // Prevents aggressive browser caching
    });
    const products = await response.json();
    
    productList.innerHTML = '';
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <h3>${p.name}</h3>
                <span class="badge available">Available</span>
            </div>
            <p>${p.description}</p>
            <div class="price">
                <i class="fa-brands fa-ethereum"></i> ${p.priceEth} ETH
            </div>
            <div class="card-actions">
                <button class="btn buy-btn" onclick="buyItem(${p.id}, '${p.priceEth}')">
                    Buy
                </button>
                <button class="btn confirm-btn" onclick="confirmItem(${p.id})">
                    <i class="fa-solid fa-check"></i> Confirm
                </button>
            </div>
        `;
        productList.appendChild(card);
    });
}

// Interact with Smart Contract: Buy
async function buyItem(id, priceEth) {
    if (!contract) return alert("Connect wallet first!");
    try {
        const priceWei = ethers.utils.parseEther(priceEth);
        const tx = await contract.buyItem(id, { value: priceWei });
        await tx.wait();
        alert("Payment sent to escrow!");
    } catch (error) {
        console.error(error);
    }
}

// Interact with Smart Contract: Confirm Delivery
async function confirmItem(id) {
    if (!contract) return alert("Connect wallet first!");
    try {
        const tx = await contract.confirmDelivery(id);
        await tx.wait(); // Wait for blockchain confirmation
        
        // Tell the Render backend to remove the item from the array
        // IMPORTANT: Replace the URL below with your actual Render URL
        await fetch(`https://escrow-market-xmi8.onrender.com/api/products${id}`, {
            method: 'DELETE'
        });

        alert("Delivery confirmed! Funds released to seller.");
        
        // Instantly refresh the UI to remove the card
        fetchProducts();
        
    } catch (error) {
        if (error.reason) {
            alert(`Transaction failed: ${error.reason}`);
        } else if (error.message.includes("Item is not in escrow")) {
            alert("You cannot confirm delivery for an item that hasn't been purchased yet.");
        } else {
            console.error("Confirmation failed:", error);
            alert("Delivery confirmation failed. Check the console.");
        }
    }
}

// List New Product
addProductForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!contract) return alert("Connect wallet first!");

    const name = document.getElementById('prodName').value;
    const desc = document.getElementById('prodDesc').value;
    const priceEth = document.getElementById('prodPrice').value;

    try {
        // 1. Prompt MetaMask and wait for blockchain confirmation
        const priceWei = ethers.utils.parseEther(priceEth);
        const tx = await contract.listItem(ethers.utils.parseEther(priceEth), name, priceWei);
        await tx.wait(); // Pauses execution until the block is mined

        // 2. Save off-chain metadata to the backend
        const totalItems = await contract.itemCount(); 
        const realId = totalItems.toNumber();

        const res = await fetch('https://escrow-market-xmi8.onrender.com/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            id: realId, // Pass the ID here!
            name: name, 
            description: desc, 
            priceEth: priceEth 
    })
});
        // Force the code to stop if the Render server rejects the save
        if (!res.ok) {
            throw new Error(`Backend failed to save. Status: ${res.status}`);
        }

        alert("Item listed successfully!");
        
        // 3. Clear the form inputs
        addProductForm.reset();
        
        // 4. Instantly pull the new database array and refresh the Available Items UI
        fetchProducts(); 
        
    } catch (error) {
        console.error("Listing failed:", error);
        alert("Failed to list the item. Check the console for details.");
    }
});

// Init UI
fetchProducts();

// --- Theme Toggle Logic ---
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('i');

// Load saved theme on startup
const savedTheme = localStorage.getItem('escrowTheme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('escrowTheme', newTheme);
    updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
    if (theme === 'dark') {
        themeIcon.className = 'fa-solid fa-sun';
    } else {
        themeIcon.className = 'fa-solid fa-moon';
    }
}