# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is a prediction market order matching simulator implemented as a single HTML file. It simulates the `_matchOrders` function of a prediction market trading system, allowing users to input taker and maker orders and see how they would be matched and executed.

## Project Structure
- `index.html` - The main HTML file with the UI structure
- `styles.css` - All styling and layout definitions
- `script.js` - Core JavaScript functionality including calculation logic and UI management
- `LICENSE` - MIT license file

## Architecture

### Core Components
The simulator consists of three main JavaScript classes:

1. **OrderCalculator** - Static utility methods for order calculations:
   - `calculateTakingAmount()` - Computes how much a maker receives for a given fill amount
   - `deriveAssetIds()` - Maps order side/token to maker/taker asset IDs (COLLATERAL, YES, NO)
   - `deriveMatchType()` - Determines match type (MINT, MERGE, COMPLEMENTARY) based on order types
   - `isCrossing()` - Validates if orders can be profitably matched

2. **ExchangeSimulator** - Manages exchange state and executes matches:
   - Tracks collateral, YES, and NO token balances
   - `executeMatch()` - Simulates the matching process with step-by-step tracking
   - Handles three match types:
     - MINT: Uses collateral to create YES+NO tokens
     - MERGE: Combines YES+NO tokens into collateral  
     - COMPLEMENTARY: Direct asset transfer

3. **UI Management** - Dynamic form handling:
   - Taker order configuration with automatic label updates
   - Dynamic maker order creation/removal
   - Real-time calculation updates and validation
   - Collapsible execution step displays

### Order Types and Matching
The simulator supports these order combinations:
- **BUY YES** taker can match with **BUY NO** (MINT) or **SELL YES** (COMPLEMENTARY) makers
- **SELL YES** taker can match with **BUY YES** (COMPLEMENTARY) or **SELL NO** (MERGE) makers

### Key Algorithms
- **Price crossing validation**: Ensures orders can be profitably matched based on their price relationships
- **Asset flow tracking**: Simulates exact token transfers through the exchange
- **Step-by-step execution**: Shows detailed balance changes for each match operation

## Running the Application
Simply open `index.html` in a web browser. No build process or dependencies required.

## Development Notes
- Modular structure with separate HTML, CSS, and JavaScript files
- Uses vanilla JavaScript with no external dependencies or build process
- Responsive grid-based layout for order inputs and results
- Export/import functionality for order configurations via JSON files