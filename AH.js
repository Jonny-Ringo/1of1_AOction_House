import { createDataItemSigner, dryrun, message, result } from "https://unpkg.com/@permaweb/aoconnect@0.0.59/dist/browser.js";

const auctionProcessId = "mnO-nGyGFwEppfpIChiUbC6vY9I6hZb5gXFH0qA0fME";
let walletConnected = false;
let profileId = null;
let selectedAssetId = null;




async function connectWallet() {
    const connectWalletButton = document.getElementById("connectWalletButton");

    try {
        if (typeof window.arweaveWallet !== 'undefined' && window.arweaveWallet.connect) {
            await window.arweaveWallet.connect(
                ["ACCESS_ADDRESS", "SIGN_TRANSACTION", "SIGNATURE"],
                {
                    name: "The AOction House",
                    logo: "https://arweave.net/AcCm-N2AOxI17KLIUqZOBxBFrExpvogn3IeM_oM2lUo",
                }
            );

            const connectedWallet = await window.arweaveWallet.getActiveAddress();
            if (!connectedWallet) {
                throw new Error("Unable to retrieve the wallet address.");
            }

            // Set wallet state and update button
            walletConnected = true;
            connectWalletButton.textContent = `Connected: ${connectedWallet.slice(0, 6)}...${connectedWallet.slice(-4)}`;
            //connectWalletButton.style.backgroundColor = "#28a745"; // Green indicates success

            console.log("Wallet connected successfully:", connectedWallet);

            // Enable auction and bid buttons if needed

            // Fetch user's BazAR profile and assets after wallet connection
            await getBazARProfile()
            displayAuctions(auctionPage);
        } else {
            showToast("Arweave wallet not found. Please ensure ArConnect is installed and enabled.");
        }
    } catch (error) {
        console.error("Error connecting wallet:", error);
        showToast("Failed to connect to Arweave wallet. Please try again.");
    }
}

window.connectWallet = connectWallet;

async function ensureWalletConnected() {
    if (!walletConnected) {
        throw new Error("Wallet not connected");  // Throw an error to stop the flow if not connected
    }
    return await window.arweaveWallet.getActiveAddress();  // Get active wallet address if connected
}



let auctionPage = 1;  // Track the current auction page
const auctionsPerPage = 1;  // Limit auctions per page (show 1 auction at a time)
let totalAuctionPages = 1;  // Total number of auction pages will be calculated
let allLiveAuctions = [];  // Store all live auctions globally for pagination

// Function to fetch live auctions
async function fetchLiveAuctions() {
    try {
        console.log("Fetching live auctions...");

        const signer = createDataItemSigner(window.arweaveWallet);

        // Fetch auction data using a dryrun
        const auctionResponse = await dryrun({
            process: auctionProcessId,
            tags: [{ name: "Action", value: "Info" }],
            signer: signer
        });

        console.log("Auction info dryrun response:", auctionResponse);

        if (auctionResponse && auctionResponse.Messages && auctionResponse.Messages.length > 0) {
            allLiveAuctions = [];

            // Loop through auction messages and extract auction data
            for (const message of auctionResponse.Messages) {
                const auctionDataTag = message.Tags.find(tag => tag.name === "Auctions");
                const bidsDataTag = message.Tags.find(tag => tag.name === "Bids"); // Bids tag

                if (auctionDataTag) {
                    const auctionData = JSON.parse(auctionDataTag.value);
                    const bidsData = bidsDataTag ? JSON.parse(bidsDataTag.value) : {};

                    // Flatten auction items and include highest bids if available
                    for (const auctionId in auctionData) {
                        const auction = auctionData[auctionId];
                        const auctionBids = bidsData[auctionId] || [];

                        let highestBid = "No Bids"; // Default value if no bids
                        let latestBidder = "N/A"; // Default value for the bidder
                        
                        if (auctionBids.length > 0) {
                            const highestBidData = auctionBids.reduce(
                                (max, bid) => (bid.Amount > max.Amount ? bid : max),
                                auctionBids[0]
                            );
                            highestBid = (highestBidData.Amount / 1e12).toFixed(6) + " wAR";
                            latestBidder = highestBidData.Bidder;  // Fetch the latest bidder
                        }

                        // Push auction with bid data and latest bidder into the global array
                        allLiveAuctions.push({
                            auctionId,
                            highestBid,  // Store highest bid in auction object
                            latestBidder, // Store latest bidder
                            ...auction
                        });
                    }
                }
            }

            totalAuctionPages = Math.ceil(allLiveAuctions.length / auctionsPerPage);
            console.log(`Total live auctions: ${allLiveAuctions.length}, Total pages: ${totalAuctionPages}`);
            displayAuctions(auctionPage);  // Call displayAuctions after fetching
        } else {
            console.error("No live auctions available.");
            showToast("No live auctions found.");
        }
    } catch (error) {
        console.error("Error fetching auctions:", error);
    }
}


// Function to display auctions with pagination
async function displayAuctions(page) {
    const auctionGrid = document.getElementById('auctionGrid');
    const paginationControls = document.getElementById('paginationControls');
    auctionGrid.innerHTML = '';  // Clear previous content

    if (!allLiveAuctions || allLiveAuctions.length === 0) {
        auctionGrid.innerHTML = '<p>No auctions available</p>';
        return;
    }

    const startIndex = (page - 1) * auctionsPerPage;
    const endIndex = Math.min(startIndex + auctionsPerPage, allLiveAuctions.length);
    const auctionsToDisplay = allLiveAuctions.slice(startIndex, endIndex);

    const auction = auctionsToDisplay[0];  // Only show one auction at a time
    const auctionId = auction.auctionId;   // Auction ID
    const assetId = auction.AssetID;       // Asset ID

    const { name: auctionName, image: auctionImage } = await getAuctionDetails(auctionId, assetId);

    const sellerFull = auction.Seller || "Unknown";  // Full seller address for comparison
    const sellerTruncated = sellerFull.slice(0, 4) + "..." + sellerFull.slice(-4);  // Truncate for display

    const minBid = formatBidAmount(auction.MinPrice / 1e12);  // Dynamically format min bid
    const highestBid = auction.highestBid !== "No Bids" ? formatBidAmount(auction.highestBid) : "No Bids";   // Dynamically format highest bid
    const expiry = auction.Expiry || "Unknown";
    const modalQuantity = auction.Quantity;

    // Truncate the latest bidder address
    const latestBidder = auction.latestBidder !== "N/A"
        ? auction.latestBidder.slice(0, 4) + "..." + auction.latestBidder.slice(-4)
        : "N/A";

    auctionGrid.innerHTML = `
        <div class="live-auctions">
        <div>
            <p class="asset-owner">Owner: <span><a href="https://ao.link/#/entity/${auction.Seller}" target="_blank">${sellerTruncated}</a></span></p>
            <img src="${auctionImage}" alt="${auctionName}" class="auction-image">
            </div>
            <div class="auction-details">
                <h3 class="auction-header">${auctionName}</h3>
                <div class= "auction-box">
                    <p class="auction-quantity">Quantity: ${modalQuantity}</p>
                    <p class="auction-price">Starting Price: <span>${minBid} wAR</span></p>
                    <p class="auction-bid">Current Bid: <span>${highestBid}</span></p>
                    <div class="bid-section">
                        <input type="number" class="bidAmountInput" step="0.000001" min="0.000001" placeholder="Enter bid amount">
                        <button id="placeBidButton" class="placeBidButton">Place Bid</button>
                        <button id="cancelAuctionButton" class="button" style="display: none;">Cancel Auction</button>
                    </div>

                    <div class="auction-countdown">
                        <p class= "auction-end">Auction Ends: ${new Date(parseInt(expiry)).toLocaleDateString()} 
                            ${new Date(parseInt(expiry)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        <p><span id="countdown-timer">00Days | 00Hrs | 00Mins | 00Sec</span></p>
                    </div>

                    <!-- Last Bidder Info -->
                    <div class="last-bidder">
                        <h3>Last Bid</h3>
                        <p class = "bidder-address">Address: <span><a href="https://ao.link/#/entity/${auction.latestBidder}" target="_blank">${latestBidder}</a></span></p>
                        <p>Bid: <span>${highestBid}</span></p>
                    </div>

                </div>
            </div>
        </div>
    `;

    // Countdown logic
    function startCountdown(endTime) {
        const countdownElement = document.getElementById("countdown-timer");

        function updateCountdown() {
            const currentTime = new Date().getTime();
            const timeDifference = endTime - currentTime;

            if (timeDifference <= 0) {
                countdownElement.innerHTML = "00 Days | 00 hrs | 00 Mins | 00 Sec";
                clearInterval(countdownInterval);
                return;
            }

            const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24)).toString().padStart(2, '0');
            const hours = Math.floor((timeDifference / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
            const minutes = Math.floor((timeDifference / (1000 * 60)) % 60).toString().padStart(2, '0');
            const seconds = Math.floor((timeDifference / 1000) % 60).toString().padStart(2, '0');

            countdownElement.innerHTML = `${days} Days | ${hours} Hrs | ${minutes} Mins | ${seconds} Sec`;
        }

        const countdownInterval = setInterval(updateCountdown, 1000);
        updateCountdown(); // Initial call to display the countdown immediately
    }

    // Start the countdown based on the expiry time
    const auctionEndTime = parseInt(expiry);  // expiry should be in milliseconds
    startCountdown(auctionEndTime);

    // Get the connected wallet address
    let connectedWallet;
    try {
        connectedWallet = await window.arweaveWallet.getActiveAddress();
    } catch (error) {
        console.error("No wallet connected, disabling auction interaction");
        connectedWallet = null;
    }

    // Place Bid Button functionality
    const placeBidButton = document.getElementById('placeBidButton');
    placeBidButton.onclick = async function () {
        try {
            const bidAmountInput = document.querySelector(".bidAmountInput");
            const bidAmount = parseFloat(bidAmountInput.value);

            if (!bidAmountInput || bidAmount <= 0) {
                showToast("Please enter a valid bid amount.");
                return;
            }

            // Ensure the user has connected a wallet
            if (!connectedWallet) {
                showToast("No wallet connected. Please connect your wallet.");
                return;
            }
            console.log("Auction ID:", auctionId);
            console.log("Bidder Profile ID:", profileId);  // Check if profileId is null
            console.log("Auction Process ID:", auctionProcessId);
            console.log("Minimum Bid:", minBid);
            console.log("Highest Bid:", highestBid);
            // Place the bid
            await placeBid(auctionId, profileId, auctionProcessId, minBid, highestBid);
            bidAmountInput.value = "";  // Clear the input field
        } catch (error) {
            console.error("Error placing bid:", error);
            showToast(error);
        }
    };

    // Cancel Auction Button functionality (if user is the seller)
    const cancelButton = document.getElementById('cancelAuctionButton');
    cancelButton.style.display = "none";  // Always start with the button hidden

    try {
        // Ensure the wallet is connected before doing anything
        const connectedWallet = await ensureWalletConnected();  // Await wallet connection

        // Only display the cancel button if the connected wallet matches the full seller address
        if (connectedWallet === auction.Seller && highestBid === "No Bids") {
            cancelButton.style.display = "inline-block";  // Show the cancel button if the seller is the logged-in user
                
            // Hide both the place bid button and the input field
            const bidAmountInput = document.querySelector(".bidAmountInput");
            const placeBidButton = document.getElementById('placeBidButton');

            if (placeBidButton) placeBidButton.style.display = "none";
            if (bidAmountInput) bidAmountInput.style.display = "none";

            cancelButton.onclick = async () => {
                try {
                    const signer = createDataItemSigner(window.arweaveWallet);

                    // Send the cancel auction request
                    const cancelResponse = await message({
                        process: auctionProcessId,
                        tags: [
                            { name: "Action", value: "Cancel-Auction" },
                            { name: "AuctionId", value: auctionId }
                        ],
                        signer: signer
                    });

                    const resultData = await result({
                        message: cancelResponse,
                        process: auctionProcessId
                    });

                    const successMessage = resultData.Output?.data || "Auction canceled successfully.";
                    showToast(successMessage);
                    await fetchLiveAuctions();  // Refresh the auction list
                } catch (error) {
                    console.error("Error canceling auction:", error);
                    showToast("Error: Failed to cancel the auction.");
                }
            };
        }
    } catch (error) {
        console.error("No wallet connected or error fetching wallet address:", error);
    }

    // Update pagination controls
    paginationControls.innerHTML = `
        <button id="prevAuctionPage" ${auctionPage === 1 ? 'disabled' : ''}>← &nbsp Prev</button>
        <span>Page ${auctionPage} of ${totalAuctionPages}</span>
        <button id="nextAuctionPage" ${auctionPage === totalAuctionPages ? 'disabled' : ''}>Next &nbsp →</button>
    `;

    document.getElementById('prevAuctionPage').addEventListener('click', () => {
        if (auctionPage > 1) {
            auctionPage--;
            displayAuctions(auctionPage);
        }
    });

    document.getElementById('nextAuctionPage').addEventListener('click', () => {
        if (auctionPage < totalAuctionPages) {
            auctionPage++;
            displayAuctions(auctionPage);
        }
    });
}



// Keep the formatBidAmount function unchanged
function formatBidAmount(amount) {
    // Convert to a number and avoid unnecessary trailing zeros
    const formattedAmount = parseFloat(amount).toFixed(6); // To ensure up to 6 decimals
    return parseFloat(formattedAmount).toString(); // Remove unnecessary trailing zeros
}



// Function to fetch auction name and image using AssetID and log AuctionID
// Function to dryrun and fetch auction name (but use AssetID directly for the image URL)
async function getAuctionDetails(auctionId, assetId) {
    try {
        const signer = createDataItemSigner(window.arweaveWallet);

        const auctionDetailsResponse = await dryrun({
            process: assetId, // Use AssetID to fetch auction details
            tags: [
                { name: "Action", value: "Info" }
            ],
            signer: signer
        });

        console.log(`Details for asset ${assetId}:`, auctionDetailsResponse);

        if (auctionDetailsResponse && auctionDetailsResponse.Messages && auctionDetailsResponse.Messages[0]) {
            const auctionData = JSON.parse(auctionDetailsResponse.Messages[0].Data);
            console.log(`AuctionID: ${auctionId}, AssetID: ${assetId}`);

            return {
                auctionId,  // Return the AuctionID for tracking
                name: auctionData.Name || assetId,  // Default to asset ID if no name is found
                image: `https://arweave.net/${assetId}`  // Use AssetID for the image URL directly
            };
        } else {
            console.warn(`No data found for asset ${assetId}`);
            return {
                auctionId,  // Return the AuctionID
                name: assetId,  // Default to asset ID
                image: `https://arweave.net/${assetId}`  // Use AssetID for the image URL
            };
        }
    } catch (error) {
        console.error(`Error fetching auction details for asset ${assetId}:`, error);
        return {
            auctionId,  // Return the AuctionID for tracking
            name: assetId,
            image: `https://arweave.net/${assetId}`  // Use AssetID for the image URL as fallback
        };
    }
}

async function placeBid(auctionId, bidderProfileId, auctionProcessId, minBid, highestBid) {
    if (!profileId) {
        showToast(`You need a BazAR profile to place bids. Please create one <a href="https://bazar.arweave.net/" target="_blank" style="color: #ffffff; text-decoration: underline;">here</a>.`);
        return;
    }

    const bidAmountInput = document.querySelector(".bidAmountInput");
    await ensureWalletConnected();

    const enteredBidAmount = parseFloat(bidAmountInput.value);
    if (!bidAmountInput || enteredBidAmount < 0.000001) {
        showToast("Error: Minimum bid is 0.000001 wAR.");
        return;
    }

    const highestBidValue = highestBid === "No Bids" ? 0 : parseFloat(highestBid);
    const minimumRequiredBid = Math.max(minBid, highestBidValue);
    if ((enteredBidAmount < minBid) || (highestBidValue !== 0 && enteredBidAmount <= highestBidValue)) {
        const errorMessage = highestBidValue !== 0
            ? `Error: Bid must be greater than ${highestBidValue} wAR.`
            : `Error: Bid must be at least ${minBid} wAR.`;
        showToast(errorMessage);
        return;
    }

    const bidAmount = (enteredBidAmount * 1e12).toString();
    try {
        const walletAddress = await window.arweaveWallet.getActiveAddress();
        const signer = createDataItemSigner(window.arweaveWallet);

        console.log("Proceeding to send the bid transaction...");
        const transferResponse = await message({
            process: "xU9zFkq3X2ZQ6olwNVvr1vUWIjc3kXTWr7xKQD6dh10",
            tags: [
                { name: "Action", value: "Transfer" },
                { name: "Target", value: "xU9zFkq3X2ZQ6olwNVvr1vUWIjc3kXTWr7xKQD6dh10" },
                { name: "Recipient", value: auctionProcessId },
                { name: "Quantity", value: bidAmount }
            ],
            signer: signer
        });

        console.log("Transfer command sent. Message ID:", transferResponse);
        const resultData = await result({
            message: transferResponse,
            process: "xU9zFkq3X2ZQ6olwNVvr1vUWIjc3kXTWr7xKQD6dh10"
        });

        const debitNotice = resultData.Messages?.find(
            msg => msg.Tags.some(tag => tag.name === "Action" && tag.value === "Debit-Notice")
        );

        if (debitNotice) {
            console.log("Debit-Notice received. Proceeding to place bid...");
            await new Promise(resolve => setTimeout(resolve, 2000));
            const bidResponse = await message({
                process: auctionProcessId,
                tags: [
                    { name: "Action", value: "Place-Bid" },
                    { name: "AuctionId", value: auctionId },
                    { name: "BidderProfileID", value: bidderProfileId }
                ],
                signer: signer
            });

            const bidResultData = await result({
                message: bidResponse,
                process: auctionProcessId
            });

            const successMessage = bidResultData.Output?.data || "Bid placed successfully.";
            showToast(successMessage);
            await fetchLiveAuctions();
        } else {
            console.error("No Debit-Notice found.");
            showToast("Error: Bid transfer failed.");
        }
    } catch (error) {
        console.error("Error placing bid:", error);
        showToast("Error: Could not place bid.");
    }
}





// Ensure modal close button triggers input reset
document.querySelector("#auctionDetailsModal .close").addEventListener("click", () => {
    closeAuctionDetails();  // Always reset on close
});


// Close auction details modal and reset the bid input
function closeAuctionDetails() {
    const modal = document.getElementById("auctionDetailsModal");
    
    // Clear the bid amount input field
    const bidAmountInput = modal.querySelector(".bidAmountInput");
    if (bidAmountInput) {
        bidAmountInput.value = ""; // Reset the input field
    }

    // Hide the modal
    modal.style.display = "none";
}


// Ensure modal close button is working
document.querySelector(".close").addEventListener('click', closeAuctionDetails);

// Fetch live auctions when the page loads
window.onload = fetchLiveAuctions;



async function getBazARProfile() {
    try {
        const walletAddress = await window.arweaveWallet.getActiveAddress();
        console.log(`Getting BazAR profile for address: ${walletAddress}`);

        const signer = createDataItemSigner(window.arweaveWallet);

        const profileResponse = await dryrun({
            process: "SNy4m-DrqxWl01YqGM4sxI8qCni-58re8uuJLvZPypY", // BazAR profile process ID
            data: JSON.stringify({ Address: walletAddress }),
            tags: [{ name: "Action", value: "Get-Profiles-By-Delegate" }],
            anchor: "1234",
            signer: signer
        });

        console.log("Profile retrieval response:", profileResponse);

        if (profileResponse && profileResponse.Messages && profileResponse.Messages[0] && profileResponse.Messages[0].Data) {
            const profileData = JSON.parse(profileResponse.Messages[0].Data);
            if (profileData && profileData[0] && profileData[0].ProfileId) {
                profileId = profileData[0].ProfileId;
                console.log("Retrieved Profile ID:", profileId);
                await fetchOwnedAssets(); // Fetch assets if the profile is found
            } else {
                throw new Error("Profile ID not found in the response.");
            }
        } else {
            throw new Error("No valid data found in the response.");
        }
    } catch (error) {
        console.error("Error retrieving BazAR profile:", error);
        showToast(`Profile not found. Please create a profile at <a href="https://bazar.arweave.net/" target="_blank" style="color: #ffffff; text-decoration: underline;">BazAR</a>.`);
    }
}



// General function to close a specific modal by ID
function closeModalById(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = "none";
    }
}

// Close auction details modal
document.querySelector("#auctionDetailsModal .close").addEventListener("click", () => {
    closeModalById("auctionDetailsModal");
});

// Close asset selection modal
document.querySelector("#assetSelectionModal .close").addEventListener("click", () => {
    closeModalById("assetSelectionModal");
});

let currentPage = 1;
const assetsPerPage = 10;
let totalPages = 1;
let allAssets = [];

// Fetch and paginate assets
async function fetchOwnedAssets() {
    try {
        if (!profileId) {
            console.error("Profile ID is not set.");
            return;
        }

        console.log(`Fetching assets for profile ID: ${profileId}`);

        const signer = createDataItemSigner(window.arweaveWallet);

        const assetResponse = await dryrun({
            process: profileId,
            data: JSON.stringify({ ProfileId: profileId }),
            tags: [
                { name: "Action", value: "Info" },
                { name: "Data-Protocol", value: "ao" },
                { name: "Type", value: "Message" },
                { name: "Variant", value: "ao.TN.1" }
            ],
            anchor: "1234",
            signer: signer
        });

        console.log("Asset retrieval response:", assetResponse);

        if (assetResponse && assetResponse.Messages && assetResponse.Messages[0] && assetResponse.Messages[0].Data) {
            const assetData = JSON.parse(assetResponse.Messages[0].Data);
            allAssets = assetData.Assets;
            totalPages = Math.ceil(allAssets.length / assetsPerPage);

            console.log(`Total assets: ${allAssets.length}, Total pages: ${totalPages}`);

            // Load the first page
            loadAssetsPage(currentPage);
        } else {
            throw new Error("No valid asset data found in the response.");
        }
    } catch (error) {
        console.error("Error fetching assets:", error);
    }
}

async function fetchBalanceForAsset(assetId) {
    try {
        console.log(`Fetching balance for asset: ${assetId}`);

        const signer = createDataItemSigner(window.arweaveWallet);

        const balanceResponse = await dryrun({
            process: assetId,
            tags: [{ name: "Action", value: "Info" }],
            signer: signer
        });

        console.log(`Balance response for asset ${assetId}:`, balanceResponse);

        if (balanceResponse && balanceResponse.Messages && balanceResponse.Messages[0]) {
            const assetData = JSON.parse(balanceResponse.Messages[0].Data);
            const balances = assetData.Balances || {};
            const availableQuantity = balances[profileId] || 0;

            console.log(`Available Quantity for ${assetId}: ${availableQuantity}`);

            // Update quantity header
            document.getElementById("quantityHeader").innerText =
                `Quantity (Available: ${availableQuantity})`;

            // Remove any previously attached event listeners
            document.getElementById('listAssetButton').removeEventListener('click', handleListAssetClick);
            
            // Add a new event listener for this asset
            document.getElementById('listAssetButton').addEventListener('click', () => handleListAssetClick(availableQuantity));
        } else {
            console.warn(`No balance data found for asset: ${assetId}`);
        }
    } catch (error) {
        console.error(`Error fetching balance for asset ${assetId}:`, error);
    }
}


// Load a specific page of assets
async function loadAssetsPage(page) {
    const startIndex = (page - 1) * assetsPerPage;
    const endIndex = Math.min(startIndex + assetsPerPage, allAssets.length);
    const assetsToDisplay = allAssets.slice(startIndex, endIndex);

    const signer = createDataItemSigner(window.arweaveWallet);

    const assetDetails = await Promise.all(
        assetsToDisplay.map(async (asset) => {
            const nameResponse = await dryrun({
                process: asset.Id,
                data: JSON.stringify({ Target: asset.Id }),
                tags: [
                    { name: "Action", value: "Info" },
                    { name: "Data-Protocol", value: "ao" },
                    { name: "Type", value: "Message" },
                    { name: "Variant", value: "ao.TN.1" }
                ],
                anchor: "1234",
                signer: signer
            });

            let assetName = asset.Id;
            if (nameResponse && nameResponse.Messages && nameResponse.Messages[0] && nameResponse.Messages[0].Data) {
                const nameData = JSON.parse(nameResponse.Messages[0].Data);
                if (nameData.Name) {
                    assetName = nameData.Name;
                }
            }

            return {
                id: asset.Id,
                title: assetName,
                thumbnail: `https://arweave.net/${asset.Id}`
            };
        })
    );

    populateAssetList(assetDetails);

    // Update pagination buttons
    document.getElementById("prevPage").disabled = currentPage === 1;
    document.getElementById("nextPage").disabled = currentPage === totalPages;
}

// Populate the asset list in the modal
// Populate the asset list in the modal
function populateAssetList(assets) {
    const assetList = document.getElementById("assetList");
    assetList.innerHTML = ""; // Clear previous content

    assets.forEach(asset => {
        const option = document.createElement("div");
        option.className = "asset-option";

        option.innerHTML = `
            <img src="${asset.thumbnail}" alt="Thumbnail"">
            <span>${asset.title}</span>
        `;

        option.onclick = async () => {
            document.querySelector("#assetDropdown .selected").innerHTML = `
                <img src="${asset.thumbnail}" alt="Thumbnail">
                <span>${asset.title}</span>
            `;
            selectedAssetId = asset.id;
            closeModalById("assetSelectionModal");

            // **Fetch balance only on asset selection**
            await fetchBalanceForAsset(selectedAssetId);
        };

        assetList.appendChild(option);
    });
}


// Handle page navigation
document.getElementById("prevPage").addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        loadAssetsPage(currentPage);
    }
});

document.getElementById("nextPage").addEventListener("click", () => {
    if (currentPage < totalPages) {
        currentPage++;
        loadAssetsPage(currentPage);
    }
});

// Show the asset modal when clicked
document.querySelector("#assetDropdown .selected").addEventListener("click", () => {
    const modal = document.getElementById("assetSelectionModal");
    modal.style.display = "block";
});

// Trigger fetching the owned assets and show them in the modal
fetchOwnedAssets();




function calculateExpiryTimestamp(days) {
    const now = Date.now();
    const durationMs = days * 24 * 60 * 60 * 1000;  // Convert days to milliseconds
    return (now + durationMs).toString();
}

let isProcessing = false; // Flag to prevent multiple signer attempts
// A wrapper function to handle the listing process
async function handleListAssetClick(availableQuantity) {
    if (isProcessing) {
        console.warn("Already processing a listing. Please wait.");
        return; // Prevent double execution
    }

    isProcessing = true; // Set the flag to prevent multiple processing
    await listAsset(availableQuantity);
    isProcessing = false; // Reset the flag after processing
}

async function listAsset(availableQuantity) {
    console.log("List Asset button clicked!");

    const priceInput = document.getElementById("price").value;
    const durationInput = document.getElementById("durationDropdown").value;
    const quantityInputRaw = document.getElementById("quantity").value;  // Raw input value
    const quantityInput = parseInt(quantityInputRaw);  // Convert to integer

    // Check if the entered quantity exceeds available quantity
    if (quantityInput > availableQuantity) {
        showToast(`Error: You are trying to list more than available. Available quantity: ${availableQuantity}`);
        return;  // Prevent the function from proceeding
    }

    // Ensure quantity input is a valid number and greater than zero
    if (!quantityInputRaw || isNaN(quantityInput) || quantityInput <= 0) {
        showToast("Please enter a valid quantity.");
        return;  // Prevent further execution
    }

    if (!selectedAssetId || !priceInput || !durationInput || !profileId) {
        showToast("Please select an asset, enter price, choose duration, and ensure your profile ID is set.");
        return;  // Prevent further execution
    }

    // Proceed with the listing process
    const minPrice = (priceInput * 1e12).toString();
    const expiryTimestamp = calculateExpiryTimestamp(durationInput);

    try {
        const signer = createDataItemSigner(window.arweaveWallet);

        const transferResponse = await message({
            process: profileId,
            tags: [
                { name: "Action", value: "Transfer" },
                { name: "Target", value: selectedAssetId },
                { name: "Recipient", value: auctionProcessId },
                { name: "Quantity", value: quantityInput.toString() }
            ],
            signer: signer
        });

        console.log("Transfer command sent. Message ID:", transferResponse);

        const transferSuccess = await pollForTransferSuccess(profileId);

        await new Promise(resolve => setTimeout(resolve, 2000));

        if (transferSuccess) {
            console.log("Transfer-Success received. Proceeding to create auction...");

            const auctionResponse = await message({
                process: auctionProcessId,
                tags: [
                    { name: "Action", value: "Create-Auction" },
                    { name: "AuctionId", value: selectedAssetId },
                    { name: "MinPrice", value: minPrice },
                    { name: "Expiry", value: expiryTimestamp },
                    { name: "Quantity", value: quantityInput.toString() },
                    { name: "SellerProfileID", value: profileId }
                ],
                signer: signer
            });

            const auctionResultData = await result({
                message: auctionResponse,
                process: auctionProcessId
            });

            const successMessage = auctionResultData.Output?.data || "Auction created successfully.";
            showToast(successMessage);

            await resetAssetSelection();
            await fetchOwnedAssets();
            await fetchLiveAuctions();
        } else {
            showToast("Error: Transfer-Success message not received.");
        }
    } catch (error) {
        console.error("Error listing asset:", error);
        showToast("Error listing asset. Please try again.");
    }
}


async function resetAssetSelection() {
    // Clear the selected asset ID
    selectedAssetId = null;

    // Reset the asset dropdown selection display
    const assetDropdownSelected = document.querySelector("#assetDropdown .selected");
    if (assetDropdownSelected) {
        assetDropdownSelected.innerHTML = "<span>Your Collection</span>";
    }

    // Reset the quantity header
    const quantityHeader = document.getElementById("quantityHeader");
    if (quantityHeader) {
        quantityHeader.innerText = "Quantity (Available: -)";
    }

    // Clear form input fields
    document.getElementById("price").value = "";       // Clear price input
    document.getElementById("quantity").value = "";    // Clear quantity input
    document.getElementById("durationDropdown").selectedIndex = 0; // Reset duration dropdown to default

    console.log("Asset selection and form fields reset.");
}



// Function to poll the results for Transfer-Received
async function pollForTransferSuccess(profileId) {
    const url = `https://cu.ao-testnet.xyz/results/${profileId}?sort=DESC`;

    try {
        let successFound = false;
        let attempts = 0;

        // Poll for a limited number of attempts (e.g., 5 attempts)
        while (!successFound && attempts < 5) {
            const response = await fetch(url);
            const result = await response.json();

            console.log("Polling result:", result);

            // Check if Transfer-Received message is in the result
            const transferReceived = result.edges.find(edge => {
                const output = edge.node.Output;
                if (output && output.data) {
                    // Log the raw output data to inspect the exact content
                    console.log("Raw Output Data:", output.data);

                    // Remove any ANSI escape codes from the output data
                    const cleanedData = removeAnsiCodes(output.data);

                    // Log the cleaned data after removing ANSI codes
                    console.log("Cleaned Output Data:", cleanedData);

                    // Check if the cleaned output contains the 'Transfer Received' action
                    return cleanedData.includes("Transfer Received");
                }
                return false;
            });

            if (transferReceived) {
                console.log("Transfer-Received message found:", transferReceived);

                // Display full message content using a toast
                const messageContent = transferReceived.node.Output.data;
                showToast(`Full message: ${removeAnsiCodes(messageContent)}`);

                successFound = true;
                return true;  // Success
            }

            // Wait for a few seconds before polling again
            await new Promise(resolve => setTimeout(resolve, 3000));  // Wait 3 seconds
            attempts++;
        }

        return false;  // Failed to find Transfer-Received message
    } catch (error) {
        console.error("Error polling Transfer-Received:", error);
        return false;
    }
}

// Function to remove ANSI escape codes from a string
function removeAnsiCodes(str) {
    return str.replace(/\u001b\[.*?m/g, "");
}


// Show toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-message toast-show';  // Add initial classes for visibility
    toast.innerHTML = message;
    document.body.appendChild(toast);

    // Set a timeout to remove the toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');

        // After the fade-out animation, remove the toast from the DOM
        setTimeout(() => {
            toast.remove();
        }, 500);  // Match this to the fade-out duration (0.5s)
    }, 3000);  // Show the toast for 3 seconds before starting the fade-out
}

