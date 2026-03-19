
# Tối ưu 4 flow Flowise cho use case **AI Phân Tích Doanh Thu (Decision Intelligence)**

## 1) Mục tiêu mới

Biến bộ flow đang phục vụ bài toán **nghiên cứu/chiến lược bệnh viện** thành bộ flow phục vụ **ra quyết định kinh doanh**:

- Giờ nào đông nhất / doanh thu cao nhất?
- Món nào lời cao nhất / margin tốt nhất?
- Khách đến từ đâu? Kênh nào hiệu quả?
- AI đề xuất:
  - tăng giá giờ cao điểm
  - đẩy món lợi nhuận cao
  - tạo combo theo pattern thực tế
  - tối ưu kênh bán và nguồn khách

---

## 2) Điều bắt buộc trước khi làm AI

### 2.1. Đừng giao toàn bộ phép tính cho LLM
LLM nên làm 2 việc:
1. **đọc số liệu đã chuẩn hóa**
2. **rút insight + đề xuất hành động**

LLM **không nên** là nơi tính toán chính cho:
- revenue
- cogs
- gross profit
- margin %
- average order value
- repeat rate
- hour peak ranking

Các phép tính này nên làm ở:
- SQL / BigQuery / PostgreSQL
- Google Sheets / Apps Script
- n8n / Make / Python ETL
- hoặc ít nhất 1 node custom function trước khi gọi model

### 2.2. Muốn tính margin từng món thì phải có thêm dữ liệu cost
Ngoài:
- booking
- order
- revenue

bạn **bắt buộc** cần thêm ít nhất 1 trong 2 thứ sau:
- `recipe_cost` (giá vốn theo công thức món)
- `product_cost` / `cogs`

Nếu không có cost, AI chỉ kết luận được:
- món bán chạy
- món doanh thu cao
- món giá trị đơn cao

chứ **không kết luận đúng “món nào lời cao”**.

---

## 3) Kiến trúc 4 flow mới nên dùng

## Flow 1 — Data Intake & QA
**Tên đề xuất:** `Revenue_Data_Intake_QA`

### Vai trò
- nhận payload dữ liệu đầu vào
- kiểm tra chất lượng dữ liệu
- chuẩn hóa field
- xác định phần nào đủ/không đủ để phân tích
- tạo một “business snapshot” sạch cho flow sau

### Input chuẩn
```json
{
  "business_name": "Nhà hàng ABC",
  "period": {
    "from": "2026-03-01",
    "to": "2026-03-07"
  },
  "timezone": "Asia/Ho_Chi_Minh",
  "booking": [],
  "orders": [],
  "revenue": [],
  "product_cost": [],
  "channel_map": [],
  "customer_source_map": []
}
```

### Output chuẩn
```json
{
  "meta": {
    "business_name": "Nhà hàng ABC",
    "period_from": "2026-03-01",
    "period_to": "2026-03-07",
    "timezone": "Asia/Ho_Chi_Minh"
  },
  "data_quality": {
    "is_usable": true,
    "missing_fields": [],
    "warnings": [],
    "critical_issues": []
  },
  "normalized_snapshot": {
    "hourly": [],
    "products": [],
    "channels": [],
    "customer_sources": []
  },
  "anomalies": [],
  "assumptions": []
}
```

---

## Flow 2 — Profitability Analysis
**Tên đề xuất:** `Revenue_Profitability_Analysis`

### Vai trò
- đọc snapshot đã chuẩn hóa từ Flow 1
- phân tích theo:
  - giờ
  - món
  - kênh
  - nguồn khách
- xếp hạng profit driver
- tìm peak hour
- phân tích margin và blind spots

### Output chuẩn
```json
{
  "executive_summary": "",
  "hour_analysis": [],
  "product_analysis": [],
  "channel_analysis": [],
  "source_analysis": [],
  "margin_findings": [],
  "patterns": [],
  "risks": [],
  "recommended_actions": []
}
```

---

## Flow 3 — Pattern Challenger / Decision Risk
**Tên đề xuất:** `Revenue_Patterns_Challenge`

### Vai trò
- phản biện kết luận từ Flow 2
- kiểm tra recommendation nào rủi ro / thiếu dữ liệu
- phát hiện pattern giả, seasonal effect, outlier effect
- chuyển insight thành giả thuyết thử nghiệm

### Output chuẩn
```json
{
  "validated_patterns": [],
  "weak_patterns": [],
  "pricing_risks": [],
  "experiment_backlog": [],
  "confidence_notes": []
}
```

---

## Flow 4 — Owner Decision Pack
**Tên đề xuất:** `Revenue_Decision_Pack`

### Vai trò
- đóng gói tất cả thành báo cáo cho chủ/quản lý
- tạo output dễ hành động:
  - 3 việc làm ngay
  - 3 thí nghiệm trong 7 ngày
  - món cần push
  - khung giờ cần tối ưu
  - kênh cần cắt / tăng ngân sách

### Output chuẩn
```json
{
  "owner_summary": "",
  "top_decisions_this_week": [],
  "pricing_actions": [],
  "menu_actions": [],
  "channel_actions": [],
  "customer_source_actions": [],
  "experiments_7d": [],
  "kpi_to_track": []
}
```

---

## 4) Data contract nên dùng cho automation

## 4.1. Bảng `hourly`
```json
[
  {
    "hour": 18,
    "orders": 42,
    "revenue": 12600000,
    "gross_profit": 5100000,
    "margin_pct": 40.48,
    "avg_order_value": 300000
  }
]
```

## 4.2. Bảng `products`
```json
[
  {
    "product_id": "A01",
    "product_name": "Món A",
    "qty_sold": 120,
    "revenue": 9600000,
    "cogs": 4200000,
    "gross_profit": 5400000,
    "margin_pct": 56.25,
    "attach_rate": 0.32
  }
]
```

## 4.3. Bảng `channels`
```json
[
  {
    "channel": "GrabFood",
    "orders": 95,
    "revenue": 22100000,
    "gross_profit": 6100000,
    "margin_pct": 27.6,
    "commission_cost": 4200000
  }
]
```

## 4.4. Bảng `customer_sources`
```json
[
  {
    "source": "Walk-in",
    "orders": 88,
    "revenue": 19800000,
    "gross_profit": 9300000,
    "margin_pct": 46.97,
    "new_customers": 49,
    "repeat_customers": 39
  }
]
```

---

## 5) Công thức nên tính ở ETL trước khi gọi AI

- `gross_profit = revenue - cogs`
- `margin_pct = gross_profit / revenue * 100`
- `avg_order_value = revenue / orders`
- `peak_hour_rank = rank(revenue or gross_profit by hour)`
- `product_profit_share = product_gross_profit / total_gross_profit`
- `channel_efficiency = gross_profit / orders`
- `repeat_rate = repeat_customers / total_customers`

Nếu có booking:
- `booking_show_rate = số booking đến / tổng booking`
- `booking_to_order_rate = số booking có order / tổng booking`

---

## 6) Cách sửa từng file hiện tại

## 6.1. File 1 — từ “Nghiên cứu (Perplexity)” thành “Data Intake & QA”
### Giữ lại
- Start
- Agent
- Custom Function lấy dữ liệu
- HTTP đẩy sheet

### Phải đổi
- **Bỏ hoàn toàn tư duy web research / nguồn báo**
- đổi agent prompt sang chuẩn hóa dữ liệu nội bộ
- output phải là JSON sạch, không narrative dài

### Prompt system gợi ý
```text
Bạn là AI Data Intake & QA cho hệ thống kinh doanh F&B / dịch vụ có booking và order.

Nhiệm vụ:
1. Đọc payload dữ liệu kinh doanh đầu vào.
2. Kiểm tra dữ liệu có đủ để phân tích doanh thu và margin hay không.
3. Chuẩn hóa dữ liệu thành 4 lát cắt:
   - hourly
   - products
   - channels
   - customer_sources
4. Phát hiện lỗi dữ liệu:
   - revenue âm
   - giá bán = 0
   - món không có cost
   - channel/source bị unknown
   - timestamp sai format
   - thiếu order_id / product_id
5. Không suy đoán số liệu thiếu.
6. Nếu thiếu dữ liệu quan trọng để tính margin, phải ghi rõ trong `critical_issues`.

BẮT BUỘC trả về JSON duy nhất:
{
  "meta": {
    "business_name": "string",
    "period_from": "string",
    "period_to": "string",
    "timezone": "string"
  },
  "data_quality": {
    "is_usable": true,
    "missing_fields": [],
    "warnings": [],
    "critical_issues": []
  },
  "normalized_snapshot": {
    "hourly": [],
    "products": [],
    "channels": [],
    "customer_sources": []
  },
  "anomalies": [],
  "assumptions": []
}
```

### Custom function `lấy dữ liệu`
Dùng để đẩy về sheet:
```javascript
function cleanText(text) {
    if (!text || text === "N/A") return "";
    return text
        .replace(/\\n/g, '\n')
        .replace(/\*\*/g, '')
        .replace(/###/g, '---')
        .replace(/\"/g, '"');
}

const query = ($flow.input || "").toString().trim();
const research = cleanText($research);
return JSON.stringify({ query, normalizedData: research });
```

---

## 6.2. File 2 — từ “Claude (Phân tích)” thành “Profitability Analysis”
### Giữ lại
- gọi Flow 1
- build prompt
- call model
- parse output
- đẩy sheet

### Phải đổi
- bỏ ngôn ngữ bệnh viện
- đổi output từ `executive_analysis`, `strategic_implications` sang insight kinh doanh
- bắt AI ra kết luận theo **hour / product / channel / source**

### Prompt build gợi ý
```javascript
const raw = $input;
let report = "";

if (typeof raw === 'object' && raw !== null) {
    report = (raw.data && raw.data.text) ? raw.data.text :
             (raw.text || raw.content || JSON.stringify(raw));
} else {
    report = String(raw || "");
}

const userQuestion = String($flow.input || "").trim();

const fullPrompt = `
Bạn là chuyên gia Decision Intelligence cho kinh doanh F&B / dịch vụ có booking, order và revenue.

CÂU HỎI ĐIỀU HÀNH:
${userQuestion}

DỮ LIỆU ĐẦU VÀO:
${report}

Nhiệm vụ:
1. Phân tích theo giờ:
   - khung giờ doanh thu cao nhất
   - khung giờ lợi nhuận cao nhất
   - khung giờ đông nhưng margin thấp
2. Phân tích theo món:
   - món bán chạy
   - món gross profit cao
   - món margin cao nhưng chưa bán tốt
   - món doanh thu cao nhưng profit thấp
3. Phân tích theo kênh:
   - kênh mang doanh thu lớn
   - kênh margin thấp do commission/cost
4. Phân tích theo nguồn khách:
   - nguồn nào ra doanh thu tốt
   - nguồn nào ra khách mới tốt
   - nguồn nào ra repeat customer tốt
5. Chỉ ra pattern:
   - giờ vàng
   - combo tiềm năng
   - món nên push
   - món nên xem lại giá / cost
6. Không nói chung chung. Mỗi insight phải gắn với số liệu hoặc logic dữ liệu.
7. Nếu thiếu cost thì phải ghi rõ không đủ điều kiện kết luận margin.

TRẢ VỀ JSON:
{
  "executive_summary": "string",
  "hour_analysis": [
    {
      "finding": "string",
      "evidence": "string",
      "action": "string"
    }
  ],
  "product_analysis": [],
  "channel_analysis": [],
  "source_analysis": [],
  "margin_findings": [],
  "patterns": [],
  "risks": [],
  "recommended_actions": []
}
`;

return JSON.stringify({
    model: "claude-3-5-sonnet-20241022",
    messages: [{ role: "user", content: fullPrompt }],
    temperature: 0.3
});
```

### Parse output gợi ý
```javascript
const response = (typeof $raw !== 'undefined') ? $raw : $input;
if (!response) return "❌ Lỗi: Không kết nối được dữ liệu.";

let content = "";
try {
    const data = (typeof response === 'string') ? JSON.parse(response) : response;
    content = data.http?.data?.choices?.[0]?.message?.content
           || data.data?.choices?.[0]?.message?.content
           || data.choices?.[0]?.message?.content;
} catch (e) {
    return "❌ Lỗi API: " + e.message;
}

if (!content) return "⚠️ Không tìm thấy nội dung phân tích.";

try {
    const analysis = JSON.parse(content);

    let report = `## BÁO CÁO PHÂN TÍCH LỢI NHUẬN & DOANH THU\n\n`;
    report += `**1. TÓM TẮT ĐIỀU HÀNH**\n${analysis.executive_summary}\n\n`;

    report += `**2. THEO KHUNG GIỜ**\n`;
    (analysis.hour_analysis || []).forEach(item => {
        report += `- ${item.finding}\n  - Evidence: ${item.evidence}\n  - Action: ${item.action}\n`;
    });

    report += `\n**3. THEO SẢN PHẨM**\n`;
    (analysis.product_analysis || []).forEach(item => {
        report += `- ${item.finding}\n  - Evidence: ${item.evidence}\n  - Action: ${item.action}\n`;
    });

    report += `\n**4. THEO KÊNH**\n`;
    (analysis.channel_analysis || []).forEach(item => {
        report += `- ${item.finding}\n  - Evidence: ${item.evidence}\n  - Action: ${item.action}\n`;
    });

    report += `\n**5. THEO NGUỒN KHÁCH**\n`;
    (analysis.source_analysis || []).forEach(item => {
        report += `- ${item.finding}\n  - Evidence: ${item.evidence}\n  - Action: ${item.action}\n`;
    });

    report += `\n**6. HÀNH ĐỘNG ĐỀ XUẤT**\n`;
    (analysis.recommended_actions || []).forEach(item => {
        report += `- ${item}\n`;
    });

    return report;
} catch (error) {
    return content;
}
```

---

## 6.3. File 3 — từ “Grok phản biện/xu hướng” thành “Pattern Challenger”
### Giữ lại
- gọi Flow 2
- build prompt
- call model
- parse
- đẩy sheet

### Phải đổi
- bỏ hoàn toàn social critique / trend X / rumor
- thay bằng logic phản biện insight kinh doanh:
  - pattern có thật hay do sample nhỏ?
  - giờ vàng có lặp lại hay chỉ là outlier?
  - tăng giá 10% có rủi ro gì?
  - món margin cao nhưng volume thấp có nên push thật không?

### Prompt build gợi ý
```javascript
const resClaude = $input;
const reportClaude = resClaude?.data?.text || resClaude?.text || "Không lấy được dữ liệu phân tích.";

const fullPrompt = `
Bạn là AI phản biện quyết định kinh doanh cho chủ nhà hàng/cửa hàng.

DỮ LIỆU PHÂN TÍCH TỪ FLOW TRƯỚC:
"${reportClaude}"

Nhiệm vụ:
1. Xác thực pattern nào đủ mạnh để hành động.
2. Chỉ ra pattern yếu hoặc có nguy cơ hiểu sai.
3. Đánh giá rủi ro khi:
   - tăng giá giờ cao điểm
   - push món margin cao
   - tạo combo
   - dồn ngân sách vào 1 kênh
4. Biến insight thành backlog thí nghiệm 7 ngày.
5. Mỗi thí nghiệm phải có:
   - hypothesis
   - expected impact
   - risk
   - KPI cần theo dõi

TRẢ VỀ JSON:
{
  "validated_patterns": [],
  "weak_patterns": [],
  "pricing_risks": [],
  "experiment_backlog": [],
  "confidence_notes": []
}
`;

return JSON.stringify({
    model: "grok-3",
    messages: [{ role: "user", content: fullPrompt }],
    temperature: 0.4
});
```

### Parse output gợi ý
```javascript
const resGrok = $grok_res;
let combinedOutput = "";

try {
    let grokRaw = (typeof resGrok === 'string') ? resGrok.replace(/<[^>]*>?/gm, '').trim() : resGrok;
    const dataObj = (typeof grokRaw === 'string') ? JSON.parse(grokRaw) : grokRaw;

    let grokContent = dataObj?.data?.choices?.[0]?.message?.content ||
                      dataObj?.choices?.[0]?.message?.content || "";

    const startIdx = grokContent.indexOf('{');
    const endIdx = grokContent.lastIndexOf('}');

    if (startIdx !== -1) {
        const grokData = JSON.parse(grokContent.substring(startIdx, endIdx + 1));

        combinedOutput = `# TỔNG HỢP KIỂM ĐỊNH PATTERN\n\n`;
        combinedOutput += `[PATTERN ĐÃ XÁC THỰC]\n${(grokData.validated_patterns || []).join("\n- ")}\n\n`;
        combinedOutput += `[PATTERN YẾU / CẦN THÊM DỮ LIỆU]\n${(grokData.weak_patterns || []).join("\n- ")}\n\n`;
        combinedOutput += `[RỦI RO VỀ GIÁ / MENU / KÊNH]\n${(grokData.pricing_risks || []).join("\n- ")}\n\n`;
        combinedOutput += `[BACKLOG THÍ NGHIỆM 7 NGÀY]\n${(grokData.experiment_backlog || []).join("\n- ")}\n\n`;
        combinedOutput += `[GHI CHÚ ĐỘ TIN CẬY]\n${(grokData.confidence_notes || []).join("\n- ")}\n\n`;
    } else {
        throw new Error("Model không trả về JSON.");
    }
} catch (e) {
    combinedOutput = `⚠️ Không parse được JSON kiểm định pattern.\n\n${String(resGrok)}`;
}

return combinedOutput;
```

---

## 6.4. File 4 — từ “GPT sáng tạo & truyền thông” thành “Owner Decision Pack”
### Giữ lại
- gọi Flow 3
- build prompt
- call model
- formatter
- đẩy sheet

### Nên bỏ
- blog
- social post
- video script
- NotebookLM upload
- polling job_id
- trả link ngoài

### Output mới
- báo cáo điều hành cho chủ
- action list 24h / 7 ngày
- decision card
- KPI cần theo dõi

### Prompt build gợi ý
```javascript
const rawCombo = $input?.data?.text || $input?.text || String($input);
const userQuestion = ($flow.input || "").toString().trim();

const prompt = `
Bạn là Chief Revenue Officer AI.

DỮ LIỆU TỔNG HỢP:
---
${rawCombo}
---

MỤC TIÊU:
${userQuestion}

Hãy chuyển toàn bộ dữ liệu thành gói quyết định cho chủ kinh doanh.

Yêu cầu:
1. Tóm tắt điều hành ngắn, rõ, có mức ưu tiên.
2. Chọn 3 quyết định nên làm ngay trong 24h.
3. Chọn 3 thí nghiệm nên chạy trong 7 ngày.
4. Chỉ rõ:
   - giờ nên tăng giá / không nên tăng giá
   - món nên push
   - món nên xem lại cost / giá
   - kênh nên giữ / tối ưu / cắt
   - nguồn khách nên đầu tư thêm
5. Mỗi đề xuất phải có:
   - lý do
   - tác động kỳ vọng
   - KPI theo dõi
6. Không viết kiểu truyền thông. Viết kiểu điều hành kinh doanh.

TRẢ VỀ JSON:
{
  "owner_summary": "string",
  "top_decisions_this_week": [],
  "pricing_actions": [],
  "menu_actions": [],
  "channel_actions": [],
  "customer_source_actions": [],
  "experiments_7d": [],
  "kpi_to_track": []
}
`;

return JSON.stringify({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.35
});
```

### Formatter cuối gợi ý
```javascript
let response = $gpt_res;
if (typeof response === 'string') {
    try { response = JSON.parse(response); } catch (e) {}
}

try {
    let content = response?.data?.choices?.[0]?.message?.content ||
                  response?.choices?.[0]?.message?.content ||
                  (typeof response === 'string' ? response : "");

    if (!content) throw new Error("Không tìm thấy nội dung từ GPT.");

    content = content.replace(/```json/g, "").replace(/```/g, "").trim();

    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error("Nội dung không chứa JSON hợp lệ.");

    const data = JSON.parse(content.substring(startIdx, endIdx + 1));

    let finalDoc = `# BÁO CÁO QUYẾT ĐỊNH DOANH THU\n\n`;
    finalDoc += `## 1. TÓM TẮT CHO CHỦ\n${data.owner_summary}\n\n`;

    finalDoc += `## 2. 3 QUYẾT ĐỊNH TUẦN NÀY\n`;
    (data.top_decisions_this_week || []).forEach(item => finalDoc += `- ${item}\n`);

    finalDoc += `\n## 3. HÀNH ĐỘNG VỀ GIÁ\n`;
    (data.pricing_actions || []).forEach(item => finalDoc += `- ${item}\n`);

    finalDoc += `\n## 4. HÀNH ĐỘNG VỀ MENU\n`;
    (data.menu_actions || []).forEach(item => finalDoc += `- ${item}\n`);

    finalDoc += `\n## 5. HÀNH ĐỘNG VỀ KÊNH\n`;
    (data.channel_actions || []).forEach(item => finalDoc += `- ${item}\n`);

    finalDoc += `\n## 6. HÀNH ĐỘNG VỀ NGUỒN KHÁCH\n`;
    (data.customer_source_actions || []).forEach(item => finalDoc += `- ${item}\n`);

    finalDoc += `\n## 7. THÍ NGHIỆM 7 NGÀY\n`;
    (data.experiments_7d || []).forEach(item => finalDoc += `- ${item}\n`);

    finalDoc += `\n## 8. KPI CẦN THEO DÕI\n`;
    (data.kpi_to_track || []).forEach(item => finalDoc += `- ${item}\n`);

    return finalDoc;
} catch (e) {
    return `⚠️ Lỗi format: ${e.message}`;
}
```

### Bỏ nhánh NotebookLM
Bạn nên:
- xóa node `Đẩy NoteBook LM`
- xóa node `trích xuất mã định danh công việc`
- xóa node `Kiểm tra liên tục`
- xóa `Condition`
- nối thẳng formatter cuối -> direct reply
- hoặc formatter cuối -> sheet -> direct reply

---

## 7) Thứ tự triển khai thực tế

### Bước 1
Chuẩn hóa data contract đầu vào.  
Tối thiểu phải có:
- period
- orders / revenue
- product_cost
- channel
- customer_source

### Bước 2
Dùng SQL / Sheets / n8n để tạo 4 bảng tổng hợp:
- hourly
- products
- channels
- customer_sources

### Bước 3
Sửa File 1 để chỉ làm QA + validation, không đi web.

### Bước 4
Sửa File 2 để chỉ làm profitability analysis.

### Bước 5
Sửa File 3 để chỉ làm challenge / experiment design.

### Bước 6
Sửa File 4 để làm owner decision pack, bỏ toàn bộ nhánh creative / NotebookLM.

### Bước 7
Đổi payload đẩy Google Sheet:
- `query`
- `normalizedData`
- `analysis`
- `patternReview`
- `decisionPack`
- `runAt`
- `periodFrom`
- `periodTo`

### Bước 8
Test với 3 case:
1. Có đủ cost  
2. Thiếu cost  
3. Có outlier lớn (1 giờ doanh thu tăng bất thường)

---

## 8) Mẫu payload test nhanh

```json
{
  "business_name": "Demo Restaurant",
  "period": {
    "from": "2026-03-10",
    "to": "2026-03-16"
  },
  "timezone": "Asia/Ho_Chi_Minh",
  "hourly": [
    { "hour": 11, "orders": 18, "revenue": 4200000, "gross_profit": 1680000, "margin_pct": 40.0, "avg_order_value": 233333 },
    { "hour": 12, "orders": 31, "revenue": 7800000, "gross_profit": 2730000, "margin_pct": 35.0, "avg_order_value": 251613 },
    { "hour": 18, "orders": 46, "revenue": 13200000, "gross_profit": 5940000, "margin_pct": 45.0, "avg_order_value": 286956 },
    { "hour": 19, "orders": 49, "revenue": 14100000, "gross_profit": 6063000, "margin_pct": 43.0, "avg_order_value": 287755 }
  ],
  "products": [
    { "product_id": "A01", "product_name": "Món A", "qty_sold": 120, "revenue": 9600000, "cogs": 4200000, "gross_profit": 5400000, "margin_pct": 56.25, "attach_rate": 0.32 },
    { "product_id": "B02", "product_name": "Món B", "qty_sold": 170, "revenue": 11900000, "cogs": 7800000, "gross_profit": 4100000, "margin_pct": 34.45, "attach_rate": 0.41 }
  ],
  "channels": [
    { "channel": "Walk-in", "orders": 102, "revenue": 24100000, "gross_profit": 11300000, "margin_pct": 46.89, "commission_cost": 0 },
    { "channel": "GrabFood", "orders": 95, "revenue": 22100000, "gross_profit": 6100000, "margin_pct": 27.60, "commission_cost": 4200000 }
  ],
  "customer_sources": [
    { "source": "Google Maps", "orders": 52, "revenue": 12800000, "gross_profit": 5900000, "margin_pct": 46.09, "new_customers": 31, "repeat_customers": 21 },
    { "source": "Facebook", "orders": 33, "revenue": 7500000, "gross_profit": 2800000, "margin_pct": 37.33, "new_customers": 20, "repeat_customers": 13 }
  ]
}
```

---

## 9) Checklist trước khi go-live

- [ ] Có cost cho từng món
- [ ] Có mapping channel chuẩn
- [ ] Có mapping source chuẩn
- [ ] Timezone thống nhất
- [ ] Không để AI tự bịa số
- [ ] Mọi output recommendation đều có KPI
- [ ] Có sheet log để audit mỗi lần chạy
- [ ] Có rule: thiếu cost => cấm kết luận margin
- [ ] Có rule: sample size thấp => chỉ đánh dấu hypothesis, chưa ra quyết định

---

## 10) Kết luận ngắn

Bộ 4 file hiện tại **không cần bỏ đi**.  
Bạn chỉ cần đổi đúng **vai trò từng flow**:

- `Perplexity` -> **Data Intake & QA**
- `Claude` -> **Profitability Analysis**
- `Grok` -> **Pattern Challenger**
- `GPT` -> **Owner Decision Pack**

Đây là cách tối ưu nhất vì:
- giữ được kiến trúc chain đang có
- không phải đập đi làm lại
- đổi đúng “chức năng kinh doanh” thay vì chỉ đổi câu chữ
- tách rõ:
  - chuẩn hóa dữ liệu
  - phân tích lợi nhuận
  - phản biện quyết định
  - đóng gói hành động
