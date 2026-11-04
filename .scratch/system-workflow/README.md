# คู่มือโฟลว Folio Forms สำหรับ PM

เปิด `system-map.html` ใน browser เพื่ออ่าน 23 ไดอะแกรมและคำอธิบาย เริ่มหัวข้อ 16 ถึง 23 สำหรับการบันทึก กลับมาแก้ และสถานะของแต่ละงาน ภาพฝังอยู่ในไฟล์แล้วจึงเปิดดูได้โดยไม่ต่ออินเทอร์เน็ต ปุ่ม Mermaid source ใช้ไฟล์ในโฟลเดอร์ `diagrams/` ลิงก์ source code ใน HTML ชี้ไป GitHub ณ commit ที่สำรวจและต้องมีสิทธิ์อ่าน repository

## ส่งให้ PM

ส่ง `folio-forms-system-map.zip` ให้ PM แตกไฟล์แล้วเปิด `folio-forms-system-map/system-map.html` ได้ทันที ลิงก์ `http://127.0.0.1:8173/system-map.html` ใช้ดูในเครื่องที่เปิด server อยู่เท่านั้น

คู่มือและเครื่องมือสร้างถูกเก็บใน Git การ push ยังไม่ได้ทำให้ HTML เป็นเว็บไซต์สาธารณะ

## แก้ไขและสร้างใหม่

`system-map.md` เป็นเอกสารต้นฉบับที่มีทั้งคำอธิบายและ Mermaid ส่วน `inventory.md` กับ `inventory.json` เป็นรายการ route และ model ที่สคริปต์สร้างจาก source อ่านขั้นตอนทบทวนใน [workflow maintenance](../../docs/agents/system-workflow.md) เมื่อแก้โค้ดหรือเปลี่ยน flow

ต้องมี Bun และ Python 3 ติดตั้ง dependencies ด้วย `bun install --frozen-lockfile` แล้วรันที่ root ของ Folio Forms:

```bash
bun run docs:workflow:build
bun run docs:workflow:check
```

คำสั่ง build สำรวจ source ปัจจุบัน แยก Mermaid ทั้ง 23 ภาพ เรียก Mermaid CLI `11.12.0` สร้าง SVG และ HTML ที่ฝังภาพ พร้อมสร้าง ZIP สำหรับส่งต่อ การ render ต้องใช้ Chrome/Chromium ที่ Puppeteer เปิดได้ ส่วนคำสั่ง check ใช้ SVG ที่เก็บใน Git จึงไม่ต้องมี browser

คำสั่ง check ตรวจลายนิ้วมือของ source ฝั่งแอปและ deployment, รายการหน้า/API/model/status, ความครบถ้วนของ page route และค่า status ในคู่มือ, ไฟล์กับบรรทัดอ้างอิง, hash ของ Mermaid/SVG, HTML และ ZIP ที่สร้างแล้ว CI เรียกคำสั่งนี้ด้วย การแก้ source ที่ไม่เปลี่ยน flow ยังต้องทบทวนคู่มือและระบุเหตุผลในคำอธิบายการเปลี่ยนแปลงก่อนสร้างใหม่

การสร้าง inventory ซ้ำไม่ได้อัปเดตความหมายของคำอธิบายและลูกศรให้เอง ให้แก้ `system-map.md` เทียบกับ source จริงก่อนสร้างใหม่ แล้วเปิด HTML ตรวจส่วนที่เปลี่ยนด้วย `verification.json` บันทึกผลตรวจ artifact จากคำสั่ง build ส่วนผลตรวจด้วย browser ให้ระบุในคำอธิบายการเปลี่ยนแปลง

`overview.png`, `preview.png` และ `response-status.png` เป็นภาพประกอบจากการสำรวจครั้งแรก คู่มือปัจจุบันให้อ่าน HTML และ SVG ใน `rendered/` ซึ่งสร้างใหม่ด้วยคำสั่ง build
