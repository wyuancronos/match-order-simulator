// Global state
let makerOrderCount = 0;
let exchangeState = {
    collateral: 0,
    yes: 0,
    no: 0
};

// Order calculation utilities
class OrderCalculator {
    static calculateTakingAmount(making, makerAmount, takerAmount) {
        if (makerAmount === 0) return 0;
        return (making * takerAmount) / makerAmount;
    }

    static calculateTakingAmountRounded(making, makerAmount, takerAmount) {
        return Math.floor(this.calculateTakingAmount(making, makerAmount, takerAmount));
    }

    static calculatePrice(side, makerAmount, takerAmount) {
        if (side === 'BUY') {
            return takerAmount !== 0 ? makerAmount / takerAmount : 0;
        } else {
            return makerAmount !== 0 ? takerAmount / makerAmount : 0;
        }
    }

    static deriveAssetIds(sideToken) {
        if (sideToken === 'BUY YES') return { makerAssetId: 'COLLATERAL', takerAssetId: 'YES' };
        if (sideToken === 'BUY NO') return { makerAssetId: 'COLLATERAL', takerAssetId: 'NO' };
        if (sideToken === 'SELL YES') return { makerAssetId: 'YES', takerAssetId: 'COLLATERAL' };
        if (sideToken === 'SELL NO') return { makerAssetId: 'NO', takerAssetId: 'COLLATERAL' };
        return { makerAssetId: 'COLLATERAL', takerAssetId: 'YES' };
    }

    static deriveMatchType(takerSideToken, makerSideToken) {
        const takerSide = takerSideToken.split(' ')[0];
        const makerSide = makerSideToken.split(' ')[0];
        
        if (takerSide === 'BUY' && makerSide === 'BUY') return 'MINT';
        if (takerSide === 'SELL' && makerSide === 'SELL') return 'MERGE';
        return 'COMPLEMENTARY';
    }

    static isCrossing(takerOrder, makerOrder) {
        const takerSide = takerOrder.sideToken.split(' ')[0];
        const makerSide = makerOrder.sideToken.split(' ')[0];
        const takerPrice = this.calculatePrice(takerSide, takerOrder.makerAmount, takerOrder.takerAmount);
        const makerPrice = this.calculatePrice(makerSide, makerOrder.makerAmount, makerOrder.takerAmount);

        if (takerSide === 'BUY') {
            if (makerSide === 'BUY') {
                // Both are BUY orders (e.g., BUY YES vs BUY NO): prices should sum to >= 1
                return takerPrice + makerPrice >= 1;
            }
            // BUY vs SELL (e.g., BUY YES vs SELL YES): taker price >= maker price  
            return takerPrice >= makerPrice;
        }
        
        if (takerSide === 'SELL') {
            if (makerSide === 'BUY') {
                // SELL vs BUY (e.g., SELL YES vs BUY YES): maker price >= taker price
                return makerPrice >= takerPrice;
            }
            // Both are SELL orders (e.g., SELL YES vs SELL NO): prices should sum to <= 1
            return takerPrice + makerPrice <= 1;
        }

        return false;
    }
}

// Exchange state management
class ExchangeSimulator {
    constructor() {
        this.reset();
    }

    reset() {
        this.collateral = 0;
        this.yes = 0;
        this.no = 0;
    }

    // Execute match operation based on match type with step-by-step tracking
    executeMatch(matchType, making, taking, makerAssetId, takerAssetId) {
        const steps = [];
        
        // Step 1: Transfer making amount from maker to exchange
        const beforeTransferIn = this.getState();
        if (makerAssetId === 'COLLATERAL') {
            this.collateral += making;
        } else if (makerAssetId === 'YES') {
            this.yes += making;
        } else if (makerAssetId === 'NO') {
            this.no += making;
        }
        const afterTransferIn = this.getState();
        
        steps.push({
            operation: `Transfer ${making.toLocaleString()} ${makerAssetId} from maker to exchange`,
            before: beforeTransferIn,
            after: afterTransferIn
        });

        // Step 2: Execute match operation
        const beforeMatchOp = this.getState();
        let matchOperation = '';
        
        if (matchType === 'MINT') {
            // Mint tokens using collateral
            this.collateral -= taking;
            this.yes += taking;
            this.no += taking;
            matchOperation = `MINT: Use ${taking.toLocaleString()} collateral → generate ${taking.toLocaleString()} YES + ${taking.toLocaleString()} NO`;
        } else if (matchType === 'MERGE') {
            // Merge tokens into collateral
            this.yes -= making;
            this.no -= making;
            this.collateral += making;
            matchOperation = `MERGE: Combine ${making.toLocaleString()} YES + ${making.toLocaleString()} NO → ${making.toLocaleString()} collateral`;
        } else if (matchType === 'COMPLEMENTARY') {
            matchOperation = 'COMPLEMENTARY: Direct transfer (no minting/merging needed)';
        }
        
        const afterMatchOp = this.getState();
        
        if (matchType !== 'COMPLEMENTARY') {
            steps.push({
                operation: matchOperation,
                before: beforeMatchOp,
                after: afterMatchOp
            });
        }

        // Step 3: Transfer taking amount to maker
        const beforeTransferOut = this.getState();
        if (takerAssetId === 'YES') {
            this.yes -= taking;
        } else if (takerAssetId === 'NO') {
            this.no -= taking;
        } else if (takerAssetId === 'COLLATERAL') {
            this.collateral -= taking;
        }
        const afterTransferOut = this.getState();
        
        steps.push({
            operation: `Transfer ${taking.toLocaleString()} ${takerAssetId} from exchange to maker`,
            before: beforeTransferOut,
            after: afterTransferOut
        });

        return {
            finalState: this.getState(),
            steps: steps
        };
    }

    getState() {
        return {
            collateral: this.collateral,
            yes: this.yes,
            no: this.no
        };
    }
}

// Update taker order labels based on selected side
function updateTakerLabels() {
    const sideToken = document.getElementById('takerSideToken').value;
    const makerLabel = document.getElementById('takerMakerAmountLabel');
    const takerLabel = document.getElementById('takerTakerAmountLabel');
    
    if (sideToken === 'BUY YES') {
        makerLabel.textContent = 'Maker Amount (Collateral to Pay)';
        takerLabel.textContent = 'Taker Amount (YES Tokens to Receive)';
    } else if (sideToken === 'SELL YES') {
        makerLabel.textContent = 'Maker Amount (YES Tokens to Sell)';
        takerLabel.textContent = 'Taker Amount (Collateral to Receive)';
    }
}

// Get valid maker order options based on taker order
function getValidMakerOptions(takerSideToken) {
    if (takerSideToken === 'BUY YES') {
        return [
            { value: 'BUY NO', label: 'BUY NO' },
            { value: 'SELL YES', label: 'SELL YES' }
        ];
    } else if (takerSideToken === 'SELL YES') {
        return [
            { value: 'BUY YES', label: 'BUY YES' },
            { value: 'SELL NO', label: 'SELL NO' }
        ];
    }
    return [];
}

// Update all maker order dropdowns based on taker selection
function updateMakerOrderOptions() {
    const takerSideToken = document.getElementById('takerSideToken').value;
    const validOptions = getValidMakerOptions(takerSideToken);
    
    // Update all existing maker order dropdowns
    const makerSelects = document.querySelectorAll('[id^="makerSideToken-"]');
    makerSelects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '';
        
        validOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            select.appendChild(optionElement);
        });
        
        // Try to maintain current selection if it's still valid
        const isValidSelection = validOptions.some(option => option.value === currentValue);
        if (isValidSelection) {
            select.value = currentValue;
        } else {
            select.value = validOptions[0]?.value || '';
        }
    });
}

// Initialize with one maker order
document.addEventListener('DOMContentLoaded', function() {
    addMakerOrder();
    updateTakerLabels();
    updateMakerOrderOptions();
    updateCalculations();
});

function addMakerOrder() {
    makerOrderCount++;
    const container = document.getElementById('makerOrdersContainer');
    
    const orderDiv = document.createElement('div');
    orderDiv.className = 'order-section maker-order';
    orderDiv.id = `maker-${makerOrderCount}`;
    orderDiv.innerHTML = `
        <div class="order-header">
            Maker Order #${makerOrderCount}
            <span class="match-type" id="matchType-${makerOrderCount}"></span>
            <button class="remove-btn" onclick="removeMakerOrder(${makerOrderCount})">Remove</button>
        </div>
        <div class="order-inputs">
            <div class="input-group">
                <label>Side & Token</label>
                <select id="makerSideToken-${makerOrderCount}" onchange="updateCalculations()">
                </select>
            </div>
            <div class="input-group">
                <label>Maker Amount</label>
                <input type="number" id="makerMakerAmount-${makerOrderCount}" placeholder="e.g. 47000000" oninput="updateCalculations()">
            </div>
            <div class="input-group">
                <label>Taker Amount</label>
                <input type="number" id="makerTakerAmount-${makerOrderCount}" placeholder="e.g. 100000000" oninput="updateCalculations()">
            </div>
            <div class="input-group">
                <label>Making (Fill Amount)</label>
                <input type="number" id="makerMaking-${makerOrderCount}" placeholder="≤ Maker Amount" oninput="updateCalculations()">
            </div>
        </div>
        <div class="order-results" id="makerResults-${makerOrderCount}"></div>
        <div id="makerErrors-${makerOrderCount}"></div>
    `;
    
    container.appendChild(orderDiv);
    
    // Populate the dropdown with valid options
    updateMakerOrderOptions();
    updateCalculations();
}

function removeMakerOrder(id) {
    const element = document.getElementById(`maker-${id}`);
    if (element) {
        element.remove();
        updateCalculations();
    }
}

function getTakerOrder() {
    return {
        sideToken: document.getElementById('takerSideToken').value,
        makerAmount: parseFloat(document.getElementById('takerMakerAmount').value) || 0,
        takerAmount: parseFloat(document.getElementById('takerTakerAmount').value) || 0,
        making: parseFloat(document.getElementById('takerMaking').value) || 0
    };
}

function getMakerOrders() {
    const orders = [];
    const makerElements = document.querySelectorAll('[id^="maker-"]');
    
    makerElements.forEach(element => {
        const id = element.id.split('-')[1];
        const sideToken = document.getElementById(`makerSideToken-${id}`)?.value;
        const makerAmount = parseFloat(document.getElementById(`makerMakerAmount-${id}`)?.value) || 0;
        const takerAmount = parseFloat(document.getElementById(`makerTakerAmount-${id}`)?.value) || 0;
        const making = parseFloat(document.getElementById(`makerMaking-${id}`)?.value) || 0;
        
        if (sideToken && makerAmount && takerAmount && making) {
            orders.push({
                id: parseInt(id),
                sideToken,
                makerAmount,
                takerAmount,
                making
            });
        }
    });
    
    return orders;
}

function updateCalculations() {
    const takerOrder = getTakerOrder();
    const makerOrders = getMakerOrders();
    
    // Reset exchange state
    const exchange = new ExchangeSimulator();
    
    // Step 1: Process taker order - transfer taker's assets to exchange
    const stateAfterTakerTransfer = { collateral: 0, yes: 0, no: 0 };
    if (takerOrder.making > 0) {
        const assets = OrderCalculator.deriveAssetIds(takerOrder.sideToken);
        if (assets.makerAssetId === 'COLLATERAL') {
            exchange.collateral += takerOrder.making;
            stateAfterTakerTransfer.collateral = takerOrder.making;
        } else if (assets.makerAssetId === 'YES') {
            exchange.yes += takerOrder.making;
            stateAfterTakerTransfer.yes = takerOrder.making;
        } else if (assets.makerAssetId === 'NO') {
            exchange.no += takerOrder.making;
            stateAfterTakerTransfer.no = takerOrder.making;
        }
    }
    
    // Step 2: Process each maker order
    makerOrders.forEach(maker => {
        updateMakerResults(maker, takerOrder, exchange);
    });
    
    // Step 3: Calculate taker results (only initial transfer)
    updateTakerResults(takerOrder, stateAfterTakerTransfer, exchange.getState());
    
    // Update final summary (including final taker transfer)
    updateFinalSummary(takerOrder, makerOrders, exchange);
}

function updateTakerResults(takerOrder, stateAfterTakerTransfer, finalExchangeState) {
    const resultsDiv = document.getElementById('takerResults');
    const errorsDiv = document.getElementById('takerErrors');
    
    if (!takerOrder.makerAmount || !takerOrder.takerAmount || !takerOrder.making) {
        resultsDiv.innerHTML = '<div class="result-item"><span class="result-label">Status:</span><span class="result-value">Incomplete</span></div>';
        errorsDiv.innerHTML = '';
        return;
    }
    
    const taking = OrderCalculator.calculateTakingAmount(takerOrder.making, takerOrder.makerAmount, takerOrder.takerAmount);
    const takingRounded = OrderCalculator.calculateTakingAmountRounded(takerOrder.making, takerOrder.makerAmount, takerOrder.takerAmount);
    const takerSide = takerOrder.sideToken.split(' ')[0];
    const price = OrderCalculator.calculatePrice(takerSide, takerOrder.makerAmount, takerOrder.takerAmount);
    const takerAssets = OrderCalculator.deriveAssetIds(takerOrder.sideToken);
    
    // Calculate how much taker actually receives
    let takerReceives = 0;
    if (takerAssets.takerAssetId === 'YES') {
        takerReceives = Math.max(0, finalExchangeState.yes);
    } else if (takerAssets.takerAssetId === 'COLLATERAL') {
        takerReceives = Math.max(0, finalExchangeState.collateral);
    } else if (takerAssets.takerAssetId === 'NO') {
        takerReceives = Math.max(0, finalExchangeState.no);
    }
    
    // Create execution steps for taker order (only initial transfer)
    const steps = [];
    let errors = [];
    
    // Step 1: Taker transfers making amount to exchange
    steps.push({
        operation: `Taker transfers ${takerOrder.making.toLocaleString()} ${takerAssets.makerAssetId} to exchange`,
        before: { collateral: 0, yes: 0, no: 0 },
        after: stateAfterTakerTransfer
    });
    
    // Validation
    if (takerOrder.making > takerOrder.makerAmount) {
        errors.push('Making amount cannot exceed maker amount');
    }
    
    // Check if taker will receive enough tokens
    if (takerReceives < takingRounded) {
        errors.push(`TooLittleTokensReceived: Taker expects ${takingRounded.toLocaleString()} ${takerAssets.takerAssetId} tokens, but exchange only has ${takerReceives.toLocaleString()}`);
    }
    
    // Generate steps display
    let stepsHtml = '';
    if (steps.length > 0) {
        const stepsId = 'taker-steps';
        const headerId = 'taker-header';
        
        stepsHtml = `
            <div class="collapsible-section">
                <div class="collapsible-header" id="${headerId}" onclick="toggleCollapsible('${headerId}')">
                    <span class="collapsible-title">Execution Steps (${steps.length} steps)</span>
                    <span class="collapsible-toggle">▼ Show Details</span>
                </div>
                <div class="collapsible-content" id="${stepsId}">
                    ${steps.map((step, index) => `
                        <div class="execution-step">
                            <div class="step-operation">${index + 1}. ${step.operation}</div>
                            <div class="step-balances">
                                <div class="balance-item">
                                    <div class="balance-label">Before:</div>
                                    <div>${step.before.collateral.toLocaleString()} USDC, ${step.before.yes.toLocaleString()} YES, ${step.before.no.toLocaleString()} NO</div>
                                </div>
                                <div class="balance-item">
                                    <div class="balance-label">After:</div>
                                    <div>${step.after.collateral.toLocaleString()} USDC, ${step.after.yes.toLocaleString()} YES, ${step.after.no.toLocaleString()} NO</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    resultsDiv.innerHTML = `
        <div class="result-item"><span class="result-label">Taking:</span><span class="result-value">${takingRounded.toLocaleString()}</span></div>
        <div class="result-item"><span class="result-label">Taking (exact):</span><span class="result-value">${taking.toFixed(6)}</span></div>
        <div class="result-item"><span class="result-label">Actually Receives:</span><span class="result-value">${takerReceives.toLocaleString()}</span></div>
        <div class="result-item"><span class="result-label">Price:</span><span class="result-value">${price.toFixed(6)}</span></div>
        <div class="result-item"><span class="result-label">Final Ex. Collateral:</span><span class="result-value">${finalExchangeState.collateral.toLocaleString()}</span></div>
        <div class="result-item"><span class="result-label">Final Ex. YES:</span><span class="result-value">${finalExchangeState.yes.toLocaleString()}</span></div>
        <div class="result-item"><span class="result-label">Final Ex. NO:</span><span class="result-value">${finalExchangeState.no.toLocaleString()}</span></div>
    `;
    
    // Clean up any existing steps section for taker
    const existingSteps = document.querySelector('#taker-header')?.closest('.collapsible-section');
    if (existingSteps) {
        existingSteps.remove();
    }
    
    // Add steps section after the results grid
    if (stepsHtml) {
        resultsDiv.insertAdjacentHTML('afterend', stepsHtml);
    }
    
    errorsDiv.innerHTML = errors.map(error => `<div class="error">❌ ${error}</div>`).join('');
}

function updateMakerResults(makerOrder, takerOrder, exchange) {
    const resultsDiv = document.getElementById(`makerResults-${makerOrder.id}`);
    const errorsDiv = document.getElementById(`makerErrors-${makerOrder.id}`);
    const matchTypeSpan = document.getElementById(`matchType-${makerOrder.id}`);
    
    if (!makerOrder.makerAmount || !makerOrder.takerAmount || !makerOrder.making) {
        resultsDiv.innerHTML = '<div class="result-item"><span class="result-label">Status:</span><span class="result-value">Incomplete</span></div>';
        errorsDiv.innerHTML = '';
        matchTypeSpan.innerHTML = '';
        return;
    }
    
    // Calculate match type and validate crossing
    const matchType = OrderCalculator.deriveMatchType(takerOrder.sideToken, makerOrder.sideToken);
    const isCrossing = OrderCalculator.isCrossing(takerOrder, makerOrder);
    const assets = OrderCalculator.deriveAssetIds(makerOrder.sideToken);
    
    // Update match type display
    matchTypeSpan.innerHTML = matchType;
    matchTypeSpan.className = `match-type match-${matchType.toLowerCase()}`;
    
    const taking = OrderCalculator.calculateTakingAmount(makerOrder.making, makerOrder.makerAmount, makerOrder.takerAmount);
    const takingRounded = OrderCalculator.calculateTakingAmountRounded(makerOrder.making, makerOrder.makerAmount, makerOrder.takerAmount);
    const price = OrderCalculator.calculatePrice(makerOrder.sideToken.split(' ')[0], makerOrder.makerAmount, makerOrder.takerAmount);
    
    // Execute the match to update exchange state
    let exchangeBalance = { collateral: 0, yes: 0, no: 0 };
    let matchResult = { finalState: exchangeBalance, steps: [] };
    let errors = [];
    let warnings = [];
    
    // Validation
    if (makerOrder.making > makerOrder.makerAmount) {
        errors.push('Making amount cannot exceed maker amount');
    }
    
    if (!isCrossing) {
        errors.push('Orders are not crossing - prices do not allow profitable match');
    }
    
    if (errors.length === 0) {
        try {
            matchResult = exchange.executeMatch(matchType, makerOrder.making, takingRounded, assets.makerAssetId, assets.takerAssetId);
            exchangeBalance = matchResult.finalState;
            
            // Check for potential TooLittleTokensReceived
            if (assets.takerAssetId === 'YES' && exchangeBalance.yes < 0) {
                warnings.push('TooLittleTokensReceived: Insufficient YES tokens in exchange');
            } else if (assets.takerAssetId === 'NO' && exchangeBalance.no < 0) {
                warnings.push('TooLittleTokensReceived: Insufficient NO tokens in exchange');
            } else if (assets.takerAssetId === 'COLLATERAL' && exchangeBalance.collateral < 0) {
                warnings.push('TooLittleTokensReceived: Insufficient collateral in exchange');
            }
        } catch (error) {
            errors.push(`Match execution failed: ${error.message}`);
            exchangeBalance = exchange.getState();
            matchResult = { finalState: exchangeBalance, steps: [] };
        }
    } else {
        exchangeBalance = exchange.getState();
        matchResult = { finalState: exchangeBalance, steps: [] };
    }
    
    // Generate steps display
    let stepsHtml = '';
    if (matchResult && matchResult.steps && matchResult.steps.length > 0) {
        const stepsId = `steps-${makerOrder.id}`;
        const headerId = `header-${makerOrder.id}`;
        
        stepsHtml = `
            <div class="collapsible-section">
                <div class="collapsible-header" id="${headerId}" onclick="toggleCollapsible('${headerId}')">
                    <span class="collapsible-title">Execution Steps (${matchResult.steps.length} steps)</span>
                    <span class="collapsible-toggle">▼ Show Details</span>
                </div>
                <div class="collapsible-content" id="${stepsId}">
                    ${matchResult.steps.map((step, index) => `
                        <div class="execution-step">
                            <div class="step-operation">${index + 1}. ${step.operation}</div>
                            <div class="step-balances">
                                <div class="balance-item">
                                    <div class="balance-label">Before:</div>
                                    <div>${step.before.collateral.toLocaleString()} USDC, ${step.before.yes.toLocaleString()} YES, ${step.before.no.toLocaleString()} NO</div>
                                </div>
                                <div class="balance-item">
                                    <div class="balance-label">After:</div>
                                    <div>${step.after.collateral.toLocaleString()} USDC, ${step.after.yes.toLocaleString()} YES, ${step.after.no.toLocaleString()} NO</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    resultsDiv.innerHTML = `
        <div class="result-item"><span class="result-label">Taking:</span><span class="result-value">${takingRounded.toLocaleString()}</span></div>
        <div class="result-item"><span class="result-label">Taking (exact):</span><span class="result-value">${taking.toFixed(6)}</span></div>
        <div class="result-item"><span class="result-label">Price:</span><span class="result-value">${price.toFixed(6)}</span></div>
        <div class="result-item"><span class="result-label">Final Collateral:</span><span class="result-value">${exchangeBalance.collateral.toLocaleString()}</span></div>
        <div class="result-item"><span class="result-label">Final YES:</span><span class="result-value">${exchangeBalance.yes.toLocaleString()}</span></div>
        <div class="result-item"><span class="result-label">Final NO:</span><span class="result-value">${exchangeBalance.no.toLocaleString()}</span></div>
    `;
    
    // Clean up any existing steps section for this maker order
    const existingSteps = document.querySelector(`#header-${makerOrder.id}`)?.closest('.collapsible-section');
    if (existingSteps) {
        existingSteps.remove();
    }
    
    // Add steps section after the results grid to use full width
    if (stepsHtml) {
        resultsDiv.insertAdjacentHTML('afterend', stepsHtml);
    }
    
    const allMessages = [
        ...errors.map(error => `<div class="error">❌ ${error}</div>`),
        ...warnings.map(warning => `<div class="warning">⚠️ ${warning}</div>`)
    ];
    errorsDiv.innerHTML = allMessages.join('');
}

function updateFinalSummary(takerOrder, makerOrders, exchange) {
    const summaryDiv = document.getElementById('finalSummary');
    
    if (!takerOrder.making || makerOrders.length === 0) {
        summaryDiv.innerHTML = '<div style="color: #666;">Fill in all order details to see final summary</div>';
        return;
    }
    
    // Calculate what taker expects to receive (minimum)
    const takerExpected = OrderCalculator.calculateTakingAmountRounded(takerOrder.making, takerOrder.makerAmount, takerOrder.takerAmount);
    const finalState = exchange.getState();
    const takerAssets = OrderCalculator.deriveAssetIds(takerOrder.sideToken);
    
    // According to Trading.sol _updateTakingWithSurplus, taker gets the actual balance available
    let takerActuallyReceives = 0;
    if (takerAssets.takerAssetId === 'YES') {
        takerActuallyReceives = Math.max(0, finalState.yes);
    } else if (takerAssets.takerAssetId === 'COLLATERAL') {
        takerActuallyReceives = Math.max(0, finalState.collateral);
    } else if (takerAssets.takerAssetId === 'NO') {
        takerActuallyReceives = Math.max(0, finalState.no);
    }
    
    // Create final taker transfer step
    const stateAfterTakerPayout = { ...finalState };
    if (takerAssets.takerAssetId === 'YES') {
        stateAfterTakerPayout.yes -= takerActuallyReceives;
    } else if (takerAssets.takerAssetId === 'COLLATERAL') {
        stateAfterTakerPayout.collateral -= takerActuallyReceives;
    } else if (takerAssets.takerAssetId === 'NO') {
        stateAfterTakerPayout.no -= takerActuallyReceives;
    }
    
    const takerTransferStep = {
        operation: `Final step: Exchange transfers ${takerActuallyReceives.toLocaleString()} ${takerAssets.takerAssetId} to taker`,
        before: finalState,
        after: stateAfterTakerPayout
    };
    
    // Final validation
    let finalErrors = [];
    let finalWarnings = [];
    
    // Check if taker will get enough tokens
    if (takerActuallyReceives < takerExpected) {
        finalErrors.push(`TooLittleTokensReceived: Taker expects ${takerExpected.toLocaleString()} ${takerAssets.takerAssetId} tokens, but exchange only has ${takerActuallyReceives.toLocaleString()}`);
    }
    
    // Check for negative balances
    if (finalState.collateral < 0) {
        finalErrors.push(`Insufficient collateral: ${finalState.collateral.toLocaleString()}`);
    }
    if (finalState.yes < 0) {
        finalErrors.push(`Insufficient YES tokens: ${finalState.yes.toLocaleString()}`);
    }
    if (finalState.no < 0) {
        finalErrors.push(`Insufficient NO tokens: ${finalState.no.toLocaleString()}`);
    }
    
    // Calculate net collateral flow: what exchange receives vs what it pays out
    let totalCollateralIn = 0;
    let totalCollateralOut = 0;
    let makerBreakdown = [];
    
    // Add taker's contribution
    const takerAssetFlow = OrderCalculator.deriveAssetIds(takerOrder.sideToken);
    if (takerAssetFlow.makerAssetId === 'COLLATERAL') {
        totalCollateralIn += takerOrder.making;
    }
    
    makerOrders.forEach((maker, index) => {
        const matchType = OrderCalculator.deriveMatchType(takerOrder.sideToken, maker.sideToken);
        const makerAssets = OrderCalculator.deriveAssetIds(maker.sideToken);
        const makerTaking = OrderCalculator.calculateTakingAmountRounded(maker.making, maker.makerAmount, maker.takerAmount);
        
        let collateralIn = 0;
        let collateralOut = 0;
        let description = '';
        
        if (matchType === 'COMPLEMENTARY') {
            // Maker transfers makerAssetId to exchange, exchange transfers takerAssetId to maker
            if (makerAssets.makerAssetId === 'COLLATERAL') {
                collateralIn = maker.making;
                description = `+${maker.making.toLocaleString()} USDC from maker`;
            }
            if (makerAssets.takerAssetId === 'COLLATERAL') {
                collateralOut = makerTaking;
                description = `-${makerTaking.toLocaleString()} USDC to maker`;
            }
        } else if (matchType === 'MERGE') {
            // MERGE: tokens combined into collateral, then collateral paid to maker
            collateralIn = maker.making; // From merging tokens
            collateralOut = makerTaking; // To maker
            description = `+${maker.making.toLocaleString()} USDC (MERGE) - ${makerTaking.toLocaleString()} USDC to maker = +${(maker.making - makerTaking).toLocaleString()} net`;
        } else if (matchType === 'MINT') {
            // MINT: collateral used to mint tokens, tokens paid to maker
            collateralOut = makerTaking; // Collateral consumed for minting
            description = `-${makerTaking.toLocaleString()} USDC (MINT)`;
        }
        
        totalCollateralIn += collateralIn;
        totalCollateralOut += collateralOut;
        
        makerBreakdown.push({
            index: index + 1,
            sideToken: maker.sideToken,
            matchType,
            taking: makerTaking,
            collateralIn,
            collateralOut,
            description
        });
    });
    
    // Add taker's collateral payout (they get the surplus)
    if (takerAssets.takerAssetId === 'COLLATERAL') {
        totalCollateralOut += takerActuallyReceives;
    }
    
    // Calculate net collateral balance - should be close to final exchange collateral balance
    // const netCollateralBalance = totalCollateralIn - totalCollateralOut;
    // if (Math.abs(netCollateralBalance) > 0.01) { // Use small tolerance for rounding
    //     if (netCollateralBalance > 0) {
    //         finalWarnings.push(`Exchange surplus: ${netCollateralBalance.toLocaleString()} USDC remaining`);
    //     } else {
    //         finalErrors.push(`Exchange deficit: ${Math.abs(netCollateralBalance).toLocaleString()} USDC short`);
    //     }
    // }
    
    // Generate final taker transfer step display
    const finalStepsHtml = `
        <div class="collapsible-section">
            <div class="collapsible-header" id="final-taker-header" onclick="toggleCollapsible('final-taker-header')">
                <span class="collapsible-title">Final Taker Transfer</span>
                <span class="collapsible-toggle">▼ Show Details</span>
            </div>
            <div class="collapsible-content" id="final-taker-steps">
                <div class="execution-step">
                    <div class="step-operation">${takerTransferStep.operation}</div>
                    <div class="step-balances">
                        <div class="balance-item">
                            <div class="balance-label">Before:</div>
                            <div>${takerTransferStep.before.collateral.toLocaleString()} USDC, ${takerTransferStep.before.yes.toLocaleString()} YES, ${takerTransferStep.before.no.toLocaleString()} NO</div>
                        </div>
                        <div class="balance-item">
                            <div class="balance-label">After:</div>
                            <div>${takerTransferStep.after.collateral.toLocaleString()} USDC, ${takerTransferStep.after.yes.toLocaleString()} YES, ${takerTransferStep.after.no.toLocaleString()} NO</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    summaryDiv.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 20px;">
            <div><strong>Before Taker Payout:</strong></div>
            <div><strong>Collateral:</strong> ${finalState.collateral.toLocaleString()}</div>
            <div><strong>YES:</strong> ${finalState.yes.toLocaleString()}</div>
            <div><strong>NO:</strong> ${finalState.no.toLocaleString()}</div>
        </div>
        ${finalStepsHtml}
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0;">
            <div><strong>After Taker Payout:</strong></div>
            <div><strong>Collateral:</strong> ${stateAfterTakerPayout.collateral.toLocaleString()}</div>
            <div><strong>YES:</strong> ${stateAfterTakerPayout.yes.toLocaleString()}</div>
            <div><strong>NO:</strong> ${stateAfterTakerPayout.no.toLocaleString()}</div>
        </div>
        ${finalErrors.map(error => `<div class="error">❌ ${error}</div>`).join('')}
        ${finalWarnings.map(warning => `<div class="warning">⚠️ ${warning}</div>`).join('')}
        ${finalErrors.length === 0 ? '<div style="color: #4CAF50; font-weight: bold;">✅ Match should execute successfully</div>' : ''}
    `;
}

// Toggle collapsible section
function toggleCollapsible(headerId) {
    const header = document.getElementById(headerId);
    const content = header.nextElementSibling;
    const toggle = header.querySelector('.collapsible-toggle');
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        toggle.textContent = '▼ Show Details';
    } else {
        content.classList.add('expanded');
        toggle.textContent = '▲ Hide Details';
    }
}

// Add input event listeners to taker order
document.addEventListener('DOMContentLoaded', function() {
    ['takerMakerAmount', 'takerTakerAmount', 'takerMaking'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', updateCalculations);
        }
    });
});

// Export orders to JSON format
function exportOrders() {
    const takerOrder = getTakerOrder();
    const makerOrders = getMakerOrders();
    
    // Parse side and token from sideToken field
    function parseSideToken(sideToken) {
        const parts = sideToken.split(' ');
        return {
            side: parts[0],
            token: parts[1]
        };
    }
    
    // Format taker order
    const takerSideToken = parseSideToken(takerOrder.sideToken);
    const formattedTakerOrder = {
        side: takerSideToken.side,
        token: takerSideToken.token,
        makerAmount: takerOrder.makerAmount,
        takerAmount: takerOrder.takerAmount,
        making: takerOrder.making
    };
    
    // Format maker orders
    const formattedMakerOrders = makerOrders.map(maker => {
        const makerSideToken = parseSideToken(maker.sideToken);
        return {
            side: makerSideToken.side,
            token: makerSideToken.token,
            makerAmount: maker.makerAmount,
            takerAmount: maker.takerAmount,
            making: maker.making
        };
    });
    
    // Create export object
    const exportData = {
        takerOrder: formattedTakerOrder,
        makerOrders: formattedMakerOrders
    };
    
    // Convert to JSON and download
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orders_export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Import orders from JSON file
function importOrders() {
    const fileInput = document.getElementById('importFileInput');
    fileInput.click();
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            loadOrdersFromData(importData);
        } catch (error) {
            alert('Error parsing JSON file: ' + error.message);
        }
    };
    reader.readAsText(file);
}

function loadOrdersFromData(data) {
    if (!data.takerOrder || !data.makerOrders) {
        alert('Invalid JSON format. Expected structure: { "takerOrder": {...}, "makerOrders": [...] }');
        return;
    }

    try {
        // Clear existing maker orders
        const container = document.getElementById('makerOrdersContainer');
        container.innerHTML = '';
        makerOrderCount = 0;

        // Load taker order
        const taker = data.takerOrder;

        // Handle tokenId mapping: if tokenId exists, use it as YES token reference
        let takerToken = taker.token;
        if (taker.tokenId !== undefined && !taker.token) {
            takerToken = 'YES';  // tokenId represents the YES token
        }

        const takerSideToken = `${taker.side} ${takerToken}`;

        document.getElementById('takerSideToken').value = takerSideToken;
        document.getElementById('takerMakerAmount').value = taker.makerAmount;
        document.getElementById('takerTakerAmount').value = taker.takerAmount;
        document.getElementById('takerMaking').value = taker.making;

        // Update taker labels and maker options
        updateTakerLabels();
        updateMakerOrderOptions();

        // Load maker orders
        data.makerOrders.forEach(maker => {
            addMakerOrder();
            const currentId = makerOrderCount;

            // Handle tokenId mapping for maker orders
            let makerToken = maker.token;
            if (taker.tokenId !== undefined && maker.tokenId !== undefined && !maker.token) {
                // If maker tokenId matches taker tokenId, it's YES, otherwise NO
                makerToken = (maker.tokenId === taker.tokenId) ? 'YES' : 'NO';
            }

            const makerSideToken = `${maker.side} ${makerToken}`;

            document.getElementById(`makerSideToken-${currentId}`).value = makerSideToken;
            document.getElementById(`makerMakerAmount-${currentId}`).value = maker.makerAmount;
            document.getElementById(`makerTakerAmount-${currentId}`).value = maker.takerAmount;
            document.getElementById(`makerMaking-${currentId}`).value = maker.making;
        });

        // Update calculations to show results
        updateCalculations();

        alert('Orders imported successfully!');

    } catch (error) {
        alert('Error loading orders: ' + error.message);
    }
}