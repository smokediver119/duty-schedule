const fs = require("fs");
const path = require("path");
const QR = require("qrcode");

const url = process.argv[2];
if (!url) {
  console.error("사용법: node scripts/make_qr.js <URL>");
  process.exit(1);
}

const out = path.join(__dirname, "..", "qr.png");

QR.toFile(
  out,
  url,
  { width: 640, margin: 2, color: { dark: "#d7372b", light: "#ffffff" } },
  (err) => {
    if (err) {
      console.error("❌ QR 생성 실패:", err.message);
      process.exit(1);
    }
    console.log("✅ QR 저장:", out);
    console.log("   URL:", url);
  }
);
