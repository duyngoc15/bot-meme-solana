# Hướng dẫn Toàn diện Helius APIs cho Solana Bot Development

Tài liệu này chứa toàn bộ thông tin chi tiết về tất cả các nhóm APIs, phương thức (methods), tham số (parameters) và các ví dụ thực tế của Helius. Đây là cẩm nang tra cứu đầy đủ nhất để bạn phát triển bot trên Solana.

---

## Mục Lục
1. [Thông tin cấu hình chung & Cách xác thực](#1-thông-tin-cấu-hình-chung--cách-xác-thực)
2. [Solana DAS API (Digital Asset Standard)](#2-solana-das-api-digital-asset-standard)
3. [ZK Compression API (Tiết kiệm 98% chi phí lưu trữ)](#3-zk-compression-api)
4. [Priority Fee API (Định giá gas tối ưu)](#4-priority-fee-api)
5. [Webhooks API (Lắng nghe sự kiện thời gian thực)](#5-webhooks-api)
6. [Wallet API REST (Định danh ví & Dòng tiền)](#6-wallet-api-rest)
7. [Enhanced Transactions API (Tự động giải mã giao dịch)](#7-enhanced-transactions-api)
8. [Helius Sender & Smart Transactions (Landing Rate 100%)](#8-helius-sender--smart-transactions)
9. [Standard Solana RPC & WebSockets](#9-standard-solana-rpc--websockets)

---

## 1. Thông tin cấu hình chung & Cách xác thực

Helius sử dụng API Key dạng query parameter hoặc HTTP Header để xác thực mọi yêu cầu.

*   **API Key URL format (RPC / WS):**
    *   Mainnet RPC: `https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
    *   Mainnet WSS: `wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
    *   Devnet RPC: `https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY`
    *   Devnet WSS: `wss://devnet.helius-rpc.com/?api-key=YOUR_API_KEY`
*   **API Key Header format (REST API):**
    *   Base URL: `https://api.helius.xyz`
    *   Header: `X-Api-Key: YOUR_API_KEY` hoặc truyền qua Query parameter: `?api-key=YOUR_API_KEY`

---

## 2. Solana DAS API (Digital Asset Standard)

DAS API là chuẩn API của Helius dùng để truy vấn toàn bộ thông tin Token thường (Fungible SPL), Token-2022, NFTs, Compressed NFTs (cNFTs) và Inscriptions.

> [!NOTE]
> Mọi cuộc gọi DAS API tiêu thụ **10 credits** trên tài khoản Helius.

### 2.1. `getAsset`
Lấy chi tiết metadata của một tài sản dựa trên Mint Address.
*   **Params:**
    *   `id` (Bắt buộc): Mint address (String)
    *   `options` (Tùy chọn):
        *   `showFungible` (Boolean, default: `false`): Hiển thị thông tin nếu là Token thường (SPL).
        *   `showCollectionMetadata` (Boolean): Lấy thông tin collection.
        *   `showUnverifiedCollections` (Boolean): Lấy unverified collection.
        *   `showInscription` (Boolean): Lấy chi tiết inscription.
*   **Request mẫu:**
    ```javascript
    const res = await fetch('https://mainnet.helius-rpc.com/?api-key=YOUR_KEY', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'req-get-asset',
        method: 'getAsset',
        params: { id: 'MINT_ADDRESS_HERE', options: { showFungible: true } }
      })
    });
    ```

### 2.2. `getAssetBatch`
Lấy thông tin hàng loạt (tối đa 1,000 Mint Addresses) trong 1 request duy nhất.
*   **Params:**
    *   `ids` (Bắt buộc): Array of mint addresses.
*   **Request mẫu:**
    ```javascript
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'req-batch',
      method: 'getAssetBatch',
      params: { ids: ['MINT_1', 'MINT_2'] }
    })
    ```

### 2.3. `getAssetsByOwner`
Lấy toàn bộ danh mục tài sản (Tokens/NFTs) mà một ví cụ thể đang nắm giữ.
*   **Params:**
    *   `ownerAddress` (Bắt buộc): Địa chỉ ví cần quét.
    *   `page` (Tùy chọn, bắt đầu từ 1).
    *   `limit` (Tùy chọn, tối đa 1,000).
    *   `displayOptions`: `{ showFungible: true, showNativeBalance: true, showCollectionMetadata: true }`
*   **Request mẫu:**
    ```javascript
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'assets-by-owner',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: 'WALLET_ADDRESS',
        page: 1,
        limit: 100,
        displayOptions: { showFungible: true, showNativeBalance: true }
      }
    })
    ```

### 2.4. `getAssetsByGroup`
Lấy toàn bộ các tài sản thuộc về một Collection nào đó.
*   **Params:**
    *   `groupKey` (Bắt buộc): Luôn là `"collection"`.
    *   `groupValue` (Bắt buộc): Địa chỉ Collection Mint.
    *   `page` / `limit` (Tùy chọn).
*   **Request mẫu:**
    ```javascript
    params: { groupKey: 'collection', groupValue: 'COLLECTION_MINT', page: 1, limit: 1000 }
    ```

### 2.5. `getAssetsByCreator`
Lấy toàn bộ tài sản được tạo bởi một ví Creator cụ thể.
*   **Params:**
    *   `creatorAddress` (Bắt buộc): Địa chỉ ví Creator.
    *   `onlyVerified` (Boolean): Chỉ lấy tài sản đã verified creator.
*   **Request mẫu:**
    ```javascript
    params: { creatorAddress: 'CREATOR_WALLET', onlyVerified: true, page: 1, limit: 100 }
    ```

### 2.6. `getAssetsByAuthority`
Quét các tài sản thuộc quyền hạn quản trị của một Update Authority cụ thể.
*   **Params:** `authorityAddress` (Bắt buộc), `page`, `limit`.

### 2.7. `searchAssets`
Bộ công cụ tìm kiếm và lọc tài sản nâng cao với nhiều tiêu chí kết hợp.
*   **Params:**
    *   `ownerAddress`, `creatorAddress`, `creatorVerified`
    *   `grouping`: `["collection", "COLLECTION_MINT"]`
    *   `burnt` (Boolean): Lọc các token đã bị burn hay chưa.
    *   `compressed` (Boolean): Chỉ lấy Compressed NFTs.
    *   `tokenType`: `"fungible" | "nonFungible" | "regularNft" | "compressedNft" | "all"`
    *   `sortBy`: `{ sortBy: "created" | "updated", sortDirection: "asc" | "desc" }`
*   **Request mẫu:**
    ```javascript
    params: {
      tokenType: 'fungible',
      burnt: false,
      sortBy: { sortBy: 'created', sortDirection: 'desc' }
    }
    ```

### 2.8. `getTokenAccounts`
Lấy danh sách các tài khoản nắm giữ của một token mint cụ thể (danh sách Holders) hoặc ngược lại (các token account của một Owner).
*   **Params:**
    *   `mint` (Tùy chọn): Địa chỉ token mint (để quét Holders).
    *   `owner` (Tùy chọn): Địa chỉ ví (để quét số dư).
    *   `page` / `limit` (Phân trang, limit tối đa 1,000).
*   **Ứng dụng thực tế cho Bot:** Lấy danh sách ví Holders của Memecoin cực nhanh để check tỷ lệ nắm giữ.
*   **Request mẫu:**
    ```javascript
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-holders',
      method: 'getTokenAccounts',
      params: { mint: 'TOKEN_MINT_ADDRESS', page: 1, limit: 1000 }
    })
    ```

### 2.9. `getAssetProof` / `getAssetProofBatch`
Lấy Merkle Proof cho Compressed NFT để phục vụ các giao dịch chuyển nhượng/burn cNFT.
*   **Params:** `id` (cNFT Asset ID) hoặc `ids` (Array).

### 2.10. `getSignaturesForAsset`
Lấy lịch sử giao dịch (signatures) của một cNFT cụ thể (Solana RPC tiêu chuẩn `getSignaturesForAddress` không hoạt động với cNFT).
*   **Params:** `id` (Asset ID), `page`, `limit`.

### 2.11. `getNftEditions`
Lấy danh sách tất cả các bản in (editions) từ một NFT gốc (Master Edition).

---

## 3. ZK Compression API

ZK Compression là công nghệ mới nhất trên Solana giúp lưu trữ dữ liệu tài khoản dưới dạng nén sử dụng Zero-Knowledge Proofs, giúp giảm 98% phí lưu trữ on-chain. Helius cung cấp bộ chỉ mục Photon Indexer để làm việc với dữ liệu nén này.

> [!NOTE]
> *   Các hàm ZK Compression tiêu chuẩn tiêu tốn **10 credits** mỗi request.
> *   Riêng hàm `getValidityProof` tiêu tốn **100 credits** mỗi request.

### 3.1. `getCompressedAccount`
Lấy thông tin chi tiết (data thô, owner, lamports) của một tài khoản nén.
*   **Params:**
    *   `address` (Tùy chọn): Địa chỉ ví nén (base58).
    *   `hash` (Tùy chọn): Data hash (base58). Phải điền 1 trong 2 tham số.
*   **Request mẫu:**
    ```javascript
    params: { address: 'COMPRESSED_WALLET_ADDRESS' }
    ```

### 3.2. `getCompressedAccountProof`
Lấy Merkle Proof cho một tài khoản nén để phục vụ xác minh tính hợp lệ khi cập nhật hoặc chuyển giao.
*   **Params:** `hash` (Bắt buộc): Data hash của tài khoản nén.

### 3.3. `getCompressedAccountsByOwner`
Lấy tất cả các tài khoản nén được sở hữu bởi một địa chỉ ví cụ thể.
*   **Params:**
    *   `owner` (Bắt buộc): Ví sở hữu.
    *   `cursor` (Tùy chọn): Chuỗi pagination.
    *   `limit` (Tùy chọn).
    *   `filters` (Tùy chọn): Bộ lọc `{ memcmp: { bytes, offset } }`.

### 3.4. `getCompressedBalance` / `getCompressedBalanceByOwner`
Lấy số dư SOL nén của một tài khoản nén cụ thể hoặc tổng số dư SOL nén của toàn bộ tài khoản thuộc về một Owner.

### 3.5. `getCompressedMintTokenHolders`
Liệt kê danh sách holders của một compressed token mint, sắp xếp giảm dần theo số dư (hỗ trợ phân trang qua `cursor`).
*   **Params:** `mint` (Bắt buộc), `cursor`, `limit`.

### 3.6. `getCompressedTokenAccountBalance`
Lấy số dư token của một tài khoản token nén cụ thể.
*   **Params:** `address` hoặc `hash`.

### 3.7. `getCompressedTokenAccountsByOwner` / `getCompressedTokenAccountsByDelegate`
Quét danh sách các tài khoản token nén dựa theo Owner hoặc Delegate.
*   **Params:** `owner` (hoặc `delegate`), `cursor`, `limit`, `mint` (tùy chọn lọc theo loại token).

### 3.8. `getCompressedTokenBalancesByOwner` / `getCompressedTokenBalancesByOwnerV2`
Truy vấn trực tiếp số dư của toàn bộ token nén trong ví của Owner. V2 cập nhật chuẩn định dạng trả về trường `items` thay vì `token_balances`.

### 3.9. `getCompressionSignaturesForOwner` / `getCompressionSignaturesForAddress` / `getCompressionSignaturesForAccount` / `getCompressionSignaturesForTokenOwner`
Truy vấn lịch sử giao dịch (signatures) tương tác, cập nhật hoặc đóng mở các tài khoản nén theo các đối tượng tương ứng.

### 3.10. `getIndexerHealth` / `getIndexerSlot`
Kiểm tra sức khỏe indexer ZK Compression (`"ok"`) và kiểm tra slot block mới nhất đã index.

### 3.11. `getLatestCompressionSignatures` / `getLatestNonVotingSignatures`
Truy vấn các signatures mới nhất thực hiện nén dữ liệu hoặc các giao dịch không phải voting.

### 3.12. `getMultipleCompressedAccounts` / `getMultipleCompressedAccountProofs`
Truy vấn batch hàng loạt thông tin tài khoản nén hoặc proofs của chúng.
*   **Params:** `addresses: [...]` hoặc `hashes: [...]`.

### 3.13. `getMultipleNewAddressProofs` / `getMultipleNewAddressProofsV2`
Lấy bằng chứng Merkle chứng minh các địa chỉ nén mới chuẩn bị khởi tạo là duy nhất và chưa bị trùng lắp trên mạng lưới.

### 3.14. `getTransactionWithCompressionInfo`
Lấy thông tin giao dịch chuẩn cộng thêm phần bóc tách dữ liệu nén (tài khoản nén nào được mở/đóng trong giao dịch này).
*   **Params:** `signature` (Bắt buộc).

### 3.15. `getValidityProof`
Lấy bằng chứng không tiết lộ thông tin (Zero-Knowledge Proof) để gửi lên hợp đồng thông minh on-chain chứng minh trạng thái nén hiện tại là hợp lệ.

---

## 4. Priority Fee API

Priority Fee API giúp bot tính toán mức phí ưu tiên tối ưu nhất để cạnh tranh quyền đưa giao dịch vào block nhanh nhất.

> [!TIP]
> Mỗi lượt gọi Priority Fee API chỉ tốn **1 credit**.

### 4.1. `getPriorityFeeEstimate`
Phương thức JSON-RPC gửi yêu cầu lấy thông tin ước lượng.
*   **Parameters (Object truyền vào):**
    *   `transaction` (Tùy chọn): Giao dịch đã serialized dưới dạng Base58 hoặc Base64.
    *   `accountKeys` (Tùy chọn): Array các địa chỉ ví/smart contract sẽ tương tác (Ví dụ: Raydium Pool, AMM, Token Mint...).
    *   `options` (Tùy chọn):
        *   `priorityLevel`: Mức ưu tiên mong muốn (`Min`, `Low`, `Medium`, `High`, `VeryHigh`, `UnsafeMax`).
        *   `includeAllPriorityFeeLevels` (Boolean): Trả về toàn bộ các mức phí để tự chọn.
        *   `recommended` (Boolean): Helius tự đề xuất mức tối ưu.
        *   `lookbackSlots` (Integer): Số block gần nhất để quét phân tích (1-150 block).
*   **Request mẫu:**
    ```javascript
    const response = await fetch('https://mainnet.helius-rpc.com/?api-key=YOUR_KEY', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getPriorityFeeEstimate',
        params: [{
          accountKeys: ['675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'], // Raydium
          options: { includeAllPriorityFeeLevels: true }
        }]
      })
    });
    const { result } = await response.json();
    console.log(result.priorityFeeLevels);
    ```

---

## 5. Webhooks API (Lắng nghe sự kiện thời gian thực)

Webhook đẩy trực tiếp dữ liệu giao dịch Solana về server HTTP POST của bạn ngay khi giao dịch được xác nhận.

> [!IMPORTANT]
> *   Miễn phí: Tối đa 5 Webhooks. Trả phí: Tối đa 50 Webhooks.
> *   Mỗi webhook chứa tối đa **100,000 địa chỉ** cần theo dõi.
> *   Phí quản lý (Create, Edit, Delete): **100 credits / request**.
> *   Phí nhận event: **1 credit / sự kiện đẩy về**.

### 5.1. Tạo Webhook (`POST /v0/webhooks`)
*   **Endpoint:** `https://api-mainnet.helius-rpc.com/v0/webhooks?api-key=YOUR_KEY`
*   **Body JSON:**
    *   `webhookURL` (Bắt buộc): Địa chỉ HTTPS nhận dữ liệu (Phải hỗ trợ cổng công khai).
    *   `webhookType` (Bắt buộc): `"enhanced" | "raw" | "discord" | "enhancedDevnet" | "rawDevnet"`
    *   `accountAddresses` (Bắt buộc): Mảng các địa chỉ ví cần theo dõi (tối đa 100,000).
    *   `transactionTypes` (Tùy chọn): Bộ lọc loại giao dịch (Ví dụ: `["SWAP", "TRANSFER"]`). Nếu để trống sẽ nhận toàn bộ sự kiện.
    *   `authHeader` (Tùy chọn): Header bảo mật Helius sẽ đính kèm gửi về server bạn để xác thực nguồn gửi.
*   **Mẫu tạo qua cURL / Node.js:**
    ```javascript
    const res = await fetch('https://api-mainnet.helius-rpc.com/v0/webhooks?api-key=YOUR_KEY', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookURL: 'https://my-bot-server.com/webhook',
        webhookType: 'enhanced',
        accountAddresses: ['675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'], // Raydium
        transactionTypes: ['SWAP']
      })
    });
    ```

### 5.2. Các API quản trị Webhooks khác:
*   **Xem tất cả Webhooks:** `GET /v0/webhooks?api-key=YOUR_KEY`
*   **Xem chi tiết Webhook:** `GET /v0/webhooks/{webhookID}?api-key=YOUR_KEY`
*   **Sửa Webhook (Ghi đè cấu hình):** `PUT /v0/webhooks/{webhookID}?api-key=YOUR_KEY`
*   **Bật/Tắt Webhook (Pause/Resume):** `PATCH /v0/webhooks/{webhookID}?api-key=YOUR_KEY` với body `{ "active": true | false }`.
*   **Xóa Webhook:** `DELETE /v0/webhooks/{webhookID}?api-key=YOUR_KEY`

---

## 6. Wallet API REST (Beta)

Đây là nhóm APIs REST cực kỳ hữu ích cung cấp trực tiếp thông tin ví, định danh thực thể chủ sở hữu ví và phân tích dòng tiền gốc.

> [!NOTE]
> Mỗi lượt gọi Wallet API tiêu tốn **100 credits**.

### 6.1. `GET /v1/wallet/{wallet}/identity`
Phân tích xem địa chỉ ví (hoặc tên miền `.sol` / `.bonk`) có thuộc thực thể lớn nào không (Sàn CEX, Quỹ, KOL, Exploiter, MEV Bot...).
*   **Ví dụ:**
    ```javascript
    // Kiểm tra ví toly.sol
    const identity = await fetch('https://api.helius.xyz/v1/wallet/toly.sol/identity?api-key=YOUR_KEY')
      .then(r => r.json());
    // Trả về: { address: "...", name: "Anatoly Yakovenko", category: "KOL", type: "founder", tags: ["KOL", "System"] }
    ```

### 6.2. `POST /v1/wallet/batch-identity`
Tra cứu định danh hàng loạt lên tới 100 địa chỉ ví trong một request.
*   **Body:** `{ "addresses": ["ADDRESS_1", "toly.sol", "Binance_Wallet"] }`

### 6.3. `GET /v1/wallet/{wallet}/balances`
Lấy số dư token thường & NFT có kèm định giá trị USD ước tính theo thời gian thực (top 10k token).
*   **Query params:** `page`, `limit`, `showZeroBalance`, `showNative`, `showNfts`.

### 6.4. `GET /v1/wallet/{wallet}/history`
Lấy lịch sử giao dịch đã được format thân thiện, có kèm thay đổi số dư chi tiết của từng token.
*   **Query params:** `limit`, `before` (cursor), `type` (SWAP, TRANSFER...).

### 6.5. `GET /v1/wallet/{wallet}/transfers`
Chỉ lấy danh sách chuyển nhận SOL/Token của ví (rất tốt để làm dữ liệu biểu đồ dòng tiền).

### 6.6. `GET /v1/wallet/{wallet}/funded-by`
**Tính năng độc quyền:** Tìm ví khởi nguồn đầu tiên chuyển SOL để kích hoạt ví hiện tại.
*   **Ứng dụng:** Phát hiện Sybil Attack (Kẻ gian tạo hàng loạt ví phụ để farm airdrop nhưng tất cả đều được nạp SOL ban đầu từ 1 ví chính).
*   **Response mẫu:**
    ```json
    {
      "funder": "Ví_Nguồn",
      "funderName": "Binance 1",
      "funderType": "exchange",
      "amount": 1000000000,
      "timestamp": 1704067200,
      "signature": "SIGNATURE"
    }
    ```

---

## 7. Enhanced Transactions API

Dịch vụ parse giao dịch thô cực kỳ phức tạp thành dữ liệu cấu trúc cực sạch.

> [!WARNING]
> Bản chất API `/v0/transactions` (Enhanced Transactions API) hiện tại được Helius đặt ở chế độ **Deprecated** (không cập nhật thêm tính năng mới). Helius khuyến nghị sử dụng hàm RPC tiêu chuẩn **`getTransactionsForAddress`** (để quét lịch sử) hoặc **`getTransaction`** (cho 1 tx đơn lẻ) vì chúng đã tự động hỗ trợ bóc tách đầy đủ token accounts.

*   **Endpoint:** `POST /v0/transactions?api-key=YOUR_KEY`
*   **Body:** `{ "transactions": ["SIGNATURE_1", "SIGNATURE_2"] }`
*   **Kết quả trả về:** Dữ liệu có cấu trúc bao gồm `description`, `type: "SWAP"`, `source: "JUPITER"`, chi tiết mảng `tokenTransfers` và `accountData`.

---

## 8. Helius Sender & Smart Transactions

Bot giao dịch cần tốc độ và độ tin cậy tuyệt đối. `Helius Sender` cho phép gửi giao dịch qua đường truyền ưu tiên (Staked Connections) trực tiếp đến các Validators lớn nhất mạng lưới Solana và gửi song song lên Jito MEV Bundle.

### Triển khai Smart Transaction qua Helius SDK:
SDK tự động lo phần: blockhash, mô phỏng đo compute units, gọi Priority Fee API và gửi giao dịch đồng thời qua các kênh nhanh nhất.

```typescript
import { Helius } from 'helius-sdk';
import { Transaction, SystemProgram, PublicKey, Keypair } from '@solana/web3.js';

const helius = new Helius("YOUR_HELIUS_API_KEY");
const senderKeypair = Keypair.fromSecretKey(...);

async function executeSmartSwap() {
  const transaction = new Transaction().add(
    // Thêm các instruction Swap Raydium/Jupiter của bạn ở đây...
  );

  try {
    // SDK tự động ước lượng phí ưu tiên, thêm budget instruction và gửi đi
    const signature = await helius.sendSmartTransaction(transaction, [senderKeypair]);
    console.log(`Giao dịch thành công: https://solscan.io/tx/${signature}`);
  } catch (error) {
    console.error("Giao dịch lỗi:", error);
  }
}
```

---

## 9. Standard Solana RPC & WebSockets

Helius chạy các cụm máy chủ RPC Solana đầy đủ tính năng, hỗ trợ **100% các API nguyên bản của Solana** với tốc độ phản hồi cực nhanh và tối ưu hóa định tuyến.

### 9.1. Biểu phí Credits cho Solana RPC tiêu chuẩn:
Các phương thức RPC chuẩn tiêu tốn lượng credits khác nhau tùy độ nặng nhẹ:
*   **1 Credit:** `getBalance`, `getAccountInfo`, `getMultipleAccounts`, `getClusterNodes`, `getEpochInfo`, `getSlot`, `getLatestBlockhash`, `getTokenSupply`, `getTokenAccountBalance`, `getTokenLargestAccounts`, `getRecentPrioritizationFees`, `simulateTransaction`, `sendTransaction`, ...
*   **10 Credits:** `getTransaction`, `getSignaturesForAddress`, `getBlock`, `getBlocks`, `getBlocksWithLimit`, `getBlockTime`.

---

### 9.2. Toàn bộ danh sách Solana RPC HTTP Methods được Helius hỗ trợ:

Dưới đây là danh sách đầy đủ tất cả các hàm JSON-RPC tiêu chuẩn của Solana mà bạn có thể gọi qua Helius RPC endpoint (`POST /?api-key=YOUR_KEY`):

| Nhóm phương thức | Tên phương thức RPC | Mô tả |
| :--- | :--- | :--- |
| **Account & Balances** | `getAccountInfo` | Lấy dữ liệu và owner của 1 ví/account. |
| | `getBalance` | Lấy số dư SOL (đơn vị lamports). |
| | `getMultipleAccounts` | Lấy dữ liệu của tối đa 100 accounts trong 1 request. |
| | `getProgramAccounts` | Quét toàn bộ các account được tạo bởi một program ID. |
| | `getLargestAccounts` | Lấy danh sách ví giữ nhiều SOL nhất cluster. |
| | `getMinimumBalanceForRentExemption` | Tính phí rent tối thiểu để giữ tài khoản hoạt động. |
| **Tokens (SPL)** | `getTokenAccountBalance` | Lấy số dư token của 1 token account. |
| | `getTokenAccountsByOwner` | Lấy danh sách các tài khoản token thuộc sở hữu của ví. |
| | `getTokenAccountsByDelegate` | Lấy các tài khoản token đã được ủy quyền cho ví. |
| | `getTokenLargestAccounts` | Lấy danh sách tài khoản giữ nhiều token mint này nhất. |
| | `getTokenSupply` | Lấy tổng cung của một SPL token. |
| **Transactions & Blocks**| `getTransaction` | Lấy chi tiết lịch sử, nhật ký logs của 1 giao dịch. |
| | `getSignaturesForAddress` | Lấy danh sách các signature giao dịch của ví. |
| | `sendTransaction` | Ký gửi giao dịch đã ký (raw transaction) lên mạng. |
| | `simulateTransaction` | Chạy thử nghiệm giao dịch trước khi gửi thực tế. |
| | `getSignatureStatuses` | Check trạng thái xác nhận của danh sách signatures. |
| | `getBlock` | Lấy thông tin chi tiết của 1 block (bao gồm tất cả tx). |
| | `getBlocks` / `getBlocksWithLimit` | Lấy danh sách các số slot block đã confirm. |
| | `getBlockTime` / `getBlockHeight` | Lấy Unix timestamp hoặc chiều cao block hiện tại. |
| | `getBlockProduction` | Xem hiệu năng sản xuất block của các validators. |
| | `getBlockCommitment` | Xem số lượng lamports confirm khối này. |
| **Network & Cluster** | `getClusterNodes` | Lấy thông tin mạng lưới các validators (IP, ports, keys). |
| | `getEpochInfo` / `getEpochSchedule` | Xem thông tin Epoch hiện tại hoặc lịch trình Epoch. |
| | `getGenesisHash` | Lấy hash khởi tạo của mạng lưới Solana. |
| | `getIdentity` | Lấy public key định danh của node RPC bạn gọi. |
| | `getLeaderSchedule` | Lấy lịch trình sản xuất block của validators. |
| | `getRecentPerformanceSamples` | Lấy mẫu hiệu năng TPS, số lượng giao dịch của cluster. |
| | `getRecentPrioritizationFees` | Xem lịch sử phí ưu tiên của các block trước đó. |
| | `getSlot` / `getSlotLeader` / `getSlotLeaders` | Xem slot hiện tại, leader hiện tại hoặc danh sách leaders. |
| | `getSupply` | Xem thông tin tổng cung SOL đang lưu thông. |
| | `getVersion` | Lấy phiên bản node phần mềm của RPC đang chạy. |
| | `getVoteAccounts` | Lấy danh sách tài khoản biểu quyết của validators. |
| | `getHealth` | Kiểm tra trạng thái sức khỏe node RPC. |
| | `getHighestSnapshotSlot` | Lấy slot snapshot cao nhất hiện tại. |
| | `getMaxRetransmitSlot` / `getMaxShredInsertSlot` | Xem slot lớn nhất liên quan đến shred/retransmit. |
| | `getStakeActivation` / `getStakeMinimumDelegation` | Xem trạng thái stake và lượng tối thiểu để delegate. |
| | `isBlockhashValid` | Kiểm tra blockhash còn thời hạn hiệu lực hay không. |
| | `minimumLedgerSlot` | Lấy slot thấp nhất trong sổ cái ledger của node. |

---

### 9.3. Các ví dụ gọi Solana RPC tiêu chuẩn qua Helius:

#### A. Gọi `getClusterNodes` (Lấy thông tin mạng lưới node):
*   **Request:**
    ```bash
    curl https://mainnet.helius-rpc.com/?api-key=YOUR_KEY \
      -X POST \
      -H "Content-Type: application/json" \
      -d '{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getClusterNodes"
      }'
    ```
*   **Response mẫu:**
    ```json
    {
      "jsonrpc": "2.0",
      "result": [
        {
          "pubkey": "9Q5FhL3aG...",
          "gossip": "127.0.0.1:8001",
          "tpu": "127.0.0.1:8003",
          "rpc": "127.0.0.1:8899",
          "version": "1.16.0"
        }
      ],
      "id": 1
    }
    ```

#### B. Gọi `getEpochInfo` (Lấy thông tin epoch):
*   **Request:**
    ```bash
    curl https://mainnet.helius-rpc.com/?api-key=YOUR_KEY \
      -X POST \
      -H "Content-Type: application/json" \
      -d '{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getEpochInfo"
      }'
    ```

---

### 9.4. Các WebSocket Subscriptions (Real-time qua WSS):
*   `logsSubscribe`: Lắng nghe logs của toàn bộ mạng lưới hoặc một program ID cụ thể (ví dụ: Raydium AMM `675k1UYv...` để phát hiện lệnh swap hoặc pool mới).
*   `accountSubscribe`: Lắng nghe thay đổi dữ liệu của một tài khoản cụ thể (ví dụ: theo dõi ví số dư hoặc tài khoản trạng thái của pool).
*   `programSubscribe`: Lắng nghe mọi cập nhật tài khoản thuộc quản lý của một program.
*   `signatureSubscribe`: Theo dõi một giao dịch đã gửi đi xem khi nào nó được xác nhận (`confirmed`/`finalized`).

---

## 10. Helius LaserStream gRPC (Yellowstone Geyser)

Đối với các Bot Sniper hoặc Bot Arbitrage chuyên nghiệp yêu cầu độ trễ thấp nhất có thể (dưới mili-giây), kết nối WebSocket thông thường là không đủ. Helius cung cấp dịch vụ **LaserStream gRPC** tương thích hoàn toàn với giao thức **Yellowstone Geyser (gRPC)**.

### 10.1. Điểm nổi bật:
*   **Độ trễ thấp nhất:** Nhận dữ liệu blocks, transactions và account updates nhanh hơn WebSocket từ 50ms - 200ms.
*   **Tương thích ngược:** Hoạt động tốt với mọi client viết cho Yellowstone gRPC.
*   **Khuyên dùng thư viện chính thức:** Sử dụng `helius-laserstream` SDK viết bằng Rust core kèm NAPI bindings cho NodeJS giúp xử lý lượng data cực lớn (lên tới 1.3GB/s) mà không bị quá tải CPU (NodeJS single-thread bottleneck).

### 10.2. Ví dụ code TypeScript sử dụng `helius-laserstream` SDK:
```typescript
import { subscribe, CommitmentLevel, LaserstreamConfig, SubscribeRequest } from 'helius-laserstream';

async function streamRealtimeData() {
  const config: LaserstreamConfig = {
    endpoint: "https://laserstream-mainnet-ewr.helius-rpc.com", // Chọn khu vực gần VPS của bạn nhất
    xToken: "YOUR_HELIUS_API_KEY",
  };

  const request: SubscribeRequest = {
    accounts: {},
    slots: {},
    transactions: {
      "raydium-sub": {
        vote: false,
        failed: false,
        accountInclude: ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"], // Raydium Program
      },
    },
    blocks: {},
    blocksMeta: {},
    commitment: CommitmentLevel.CONFIRMED,
  };

  // SDK tự động quản lý kết nối, tự reconnect và khôi phục slot khi mất mạng
  await subscribe(config, request, (err, data) => {
    if (err) {
      console.error("Stream lỗi:", err);
      return;
    }
    console.log("Dữ liệu realtime Geyser:", data);
  });
}
```

---

## 11. Helius Dedicated Nodes

Nếu bot của bạn chạy với tần suất giao dịch khổng lồ và liên tục, các gói RPC thông thường dựa trên Credit có thể bị giới hạn tốc độ (Rate limit) hoặc chi phí quá cao. Helius cung cấp các **Dedicated Nodes (Node chuyên dụng)**:
*   **Không giới hạn credits:** Thanh toán gói cố định hàng tháng, gọi RPC không giới hạn số lượng.
*   **Hỗ trợ Yellowstone gRPC trực tiếp:** Tích hợp trực tiếp Yellowstone gRPC Geyser on-node để stream dữ liệu.

---

## 12. Helius Agent CLI & MCP Tools

Helius hỗ trợ đắc lực cho việc phát triển các AI Agents lập trình bằng cách cung cấp CLI tạo ví/API Key tự động và MCP (Model Context Protocol).

*   **Tạo nhanh ví & API Key bằng CLI:**
    ```bash
    npm install -g helius-cli
    helius keygen
    # Fund ví nhận được 0.001 SOL và USDC
    helius signup --email you@example.com --first-name Jane --last-name Doe --json
    ```
*   **Helius MCP Server:** Cho phép các AI Coding Assistant (như Cursor, Claude Code, Gemini) kết nối trực tiếp đến node Helius để phân tích blockchain, đọc trạng thái ví và lập trình giao dịch thông qua các MCP skills có sẵn.

---

## 13. AirShip (Airdrops bằng ZK Compression)

Nếu bot của bạn có tính năng tặng thưởng (Reward) hoặc Airdrop token cho người dùng với số lượng ví lớn (hàng chục nghìn đến hàng triệu ví), sử dụng ví thông thường sẽ cực kỳ tốn SOL để tạo Token Accounts (ATA).
*   **AirShip** là công cụ airdrop của Helius dựa trên nền tảng ZK Compression.
*   **Tiết kiệm 95% chi phí:** Giảm thiểu tối đa chi phí thuê dung lượng (State rent) trên mạng Solana bằng cách nén các tài khoản token nhận thưởng.

