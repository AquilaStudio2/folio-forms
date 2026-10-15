# Folio Forms: โครงสร้างไฟล์และกติกาการวางโค้ด

ปรับหลังจัดระเบียบโค้ดและตรวจการใช้งานวันที่ 15 ตุลาคม 2026 รายละเอียดการเก็บข้อมูลอยู่ใน [Architecture](ARCHITECTURE.th.md)

## โครงสร้างหลัก

```text
folio-forms/
├── apps/
│   ├── server/                 API, domain logic และการประมวลผลเอกสาร
│   │   ├── src/
│   │   │   ├── app.ts          ประกอบ dependencies, hooks และ routes
│   │   │   ├── index.ts        เริ่ม server และ recovery
│   │   │   ├── routes/         HTTP endpoints
│   │   │   ├── http/           อ่าน input, errors และ origin checks
│   │   │   ├── forms/          ต้นแบบ, field rules, catalog และ manifest
│   │   │   ├── documents/      DOCX/package algorithms ที่มีอยู่เดิม
│   │   │   │   └── spreadsheets/  XLSX algorithms และ document processing
│   │   │   ├── responses/      ร่าง, editor configuration และข้อมูลคำตอบ
│   │   │   ├── operations/     save/publish/submit/correction และ recovery
│   │   │   ├── editor/         leases และ action authorization
│   │   │   ├── prefill/        handoff, snapshots และ validation
│   │   │   ├── auth/           identity และ password/session
│   │   │   ├── accounts/       การจัดการและ review บัญชี
│   │   │   ├── legacy-sso/     การเชื่อมบัญชีและ login legacy
│   │   │   ├── audit/          เขียนและอ่านประวัติการกระทำ
│   │   │   ├── ai-authoring/   agent, generation และ types
│   │   │   ├── onlyoffice.ts   token, editor config, force-save และ conversion
│   │   │   └── storage.ts      อ่าน/เขียน object ใน RustFS
│   │   ├── test/              HTTP, fixtures, scenarios, unit และ runtime
│   │   ├── dev.ts             ตัวควบคุม server ระหว่างพัฒนา
│   │   └── worker-image/      image ของ isolated document worker
│   ├── web/
│   │   ├── src/routes/        หน้าตาม URL ของ TanStack Router
│   │   ├── src/features/      UI และ logic ตาม feature
│   │   ├── src/components/    components ใช้ร่วม; ui/ เป็น primitives
│   │   ├── src/lib/           API client, auth และตัวช่วยร่วม
│   │   └── test/              lifecycle และ UI tests
│   ├── onlyoffice-plugin/
│   │   ├── src/               bridge, panels, Office commands และ operations
│   │   ├── test/              plugin tests กับ harness
│   │   └── build.ts           สร้าง plugin bundle
│   └── prefill-mock/          mock integration สำหรับทดสอบ
├── packages/
│   ├── db/prisma/             schema.prisma และ migrations/
│   ├── db/src/                Prisma client และ exports
│   ├── auth/                  Better Auth configuration
│   ├── env/                   ตรวจ environment configuration
│   └── config/                TypeScript configuration ร่วม
├── docs/                      คู่มือโครงสร้าง, architecture, ADR และข้อกำหนด agent
├── .scratch/                  specs, tickets และหลักฐานงานแต่ละ feature
├── gateway/                   Pingap configuration
├── onlyoffice-templates/      DOCX starter ที่ติดตามใน repository
├── compose.yaml               deployment หลัก
├── compose.dev.yaml           overrides สำหรับพัฒนา
├── package.json               scripts ระดับ workspace
└── CONTEXT.md                 คำศัพท์และกติกา domain
```

ผังนี้แสดงจุดหลัก ไม่ใช่รายการทุกไฟล์ ส่วน `ai-authoring.ts`, `document-worker.ts` และ `document-worker-server.ts` ยังอยู่ใน `server/src/` ตาม entrypoint และหน้าที่เดิม

## เลือกตำแหน่งตามหน้าที่

| จะเพิ่มหรือแก้อะไร | วางที่ไหน |
| --- | --- |
| URL, request/response, authorization ของ endpoint | `server/src/routes/` แล้วลงทะเบียนใน `app.ts` |
| parsing/validation ของ HTTP input ที่ใช้ร่วม | `server/src/http/` |
| metadata ของ Form, กฎต้นแบบ, การอ่าน manifest | `server/src/forms/` |
| อ่าน/เขียน DOCX หรือ package XML | `server/src/documents/` |
| อ่าน/เขียน XLSX, named ranges, สูตร, validation, protection | `server/src/documents/spreadsheets/` |
| เตรียมร่าง, resume, ข้อมูลคำตอบ, editor configuration | `server/src/responses/` |
| งาน save/publish/submit/correction และ transaction completion | `server/src/operations/` |
| external Prefill และการตรวจชนิดค่าที่ส่งมา | `server/src/prefill/` |
| model/constraint ใหม่หรือการปรับข้อมูลเดิม | `packages/db/prisma/schema.prisma` และ migration ใหม่ |
| หน้าจอใหม่ตาม URL | `web/src/routes/` |
| UI/logic เฉพาะ feature | `web/src/features/<feature>/` |
| component ที่ใช้หลายหน้าจอ | `web/src/components/`; primitive อยู่ `components/ui/` |
| คำสั่งที่รันภายใน ONLYOFFICE | `onlyoffice-plugin/src/*-commands.js` |
| แผงตั้งค่าและการรับส่งกับ editor | module ของ feature ใน `onlyoffice-plugin/src/` |

ไม่ต้องสร้าง framework, service layer หรือ package กลางใหม่สำหรับทุกความแตกต่างระหว่าง DOCX กับ XLSX ให้ใช้ lifecycle และ helper เดิมก่อน และแยกเฉพาะการทำงานที่ต่างกันจริง ไม่วาง logic ของ Excel ลงใน helper ของ DOCX โดยไม่ตรวจผู้เรียกเดิม

## ตำแหน่งของส่วน spreadsheet หลังจัดระเบียบ

| ไฟล์ | ความรับผิดชอบ |
| --- | --- |
| `forms/excel-binding.ts` | นิยาม `ExcelBinding` และ schemas กลางของ scalar/table/column ใช้ตรวจและสร้าง JSON ตำแหน่งร่วมกันสำหรับ draft และ published |
| `forms/spreadsheet-fields.ts` | แปลง `DraftFieldRule`/`ManifestField` เป็นข้อมูล editor และกลับเป็นแถวร่วม; ตรวจความพร้อมเผยแพร่; โหลด contract จาก named ranges ในไฟล์ |
| `responses/spreadsheet-document.ts` | เตรียม Prefill/protection ครั้งแรก, compare-and-swap และ cleanup ของร่าง |
| `operations/spreadsheet-document.ts` | เตรียมไฟล์ก่อน save/publish/submit/correction ด้วย pipeline เดิม |
| `prefill/spreadsheet-values.ts` | ตรวจค่า scalar Prefill สำหรับ XLSX |
| `documents/spreadsheets/contract.ts` | ชนิดข้อมูลและ schema ของ fields, table และ ranges |
| `documents/spreadsheets/workbook.ts` | อ่าน package, resolve named ranges และสกัดคำตอบ |
| `documents/spreadsheets/xml.ts` | อ่านและเขียน XML ภายใน XLSX |
| `documents/spreadsheets/blank.ts` | สร้าง workbook เปล่า |
| `documents/spreadsheets/protection.ts` | ตรวจการแก้ไขและตั้ง protection ของช่องกรอก |
| `documents/spreadsheets/validation.ts` | สร้าง validation/dropdown ใน workbook |
| `documents/spreadsheets/formula-bindings.ts` | ดูแลสูตรและ print area เมื่อแถวเปลี่ยน |
| `documents/spreadsheets/builder-script.ts` | สร้างคำสั่งสำหรับ ONLYOFFICE Document Builder |
| `documents/spreadsheets/engine.ts` | เรียก Builder, ส่งไฟล์ด้วย token, poll และ cleanup งานชั่วคราว |
| `documents/spreadsheets/export-snapshot.ts` | ตรึง bytes ที่บันทึกแล้วระหว่าง PDF conversion |

โฟลเดอร์ `server/src/spreadsheets/` เดิมถูกย้ายออกแล้ว ไม่สร้าง wrapper/barrel เพื่อคงเส้นทางเก่า `documents/spreadsheets/` จัดการไฟล์และ integration การเลือกแถว Prisma และการเปลี่ยนสถานะธุรกิจอยู่ใน `forms/`, `responses/`, `operations/`

ไม่เพิ่มตารางเก็บคำตอบหรือ configuration ของ Excel แยกอีกชุด ฟิลด์อยู่ใน `DraftFieldRule`/`ManifestField`, คำตอบอยู่ใน `Response`/`Submission`/`Correction` ตาม lifecycle เดิม ส่วน `binding` ในแถวฟิลด์เก็บเฉพาะข้อมูลตำแหน่งที่ Excel ต้องใช้ การประกอบ JSON สำหรับ API อยู่ที่ `forms/spreadsheet-fields.ts` ไม่กระจายการแปลงไว้ตาม routes

การปรับวันที่ 15 ตุลาคม 2026 จัดข้อมูลตำแหน่งเป็นกลุ่ม `ExcelBinding` ใน `forms/excel-binding.ts` ซึ่งมีชนิดข้อมูล TypeScript และ Zod schemas ที่ใช้ร่วมกัน การอ่านเลือก schema ตามชนิดแถว ส่วนการเขียนตรวจโครงสร้างก่อนสร้างแถว Prisma การเพิ่มกฎตำแหน่งต้องแก้ที่ไฟล์นี้ โดยคงชื่อ/ชนิด/กฎทั่วไปไว้ในแถวฟิลด์เดิม

ปลั๊กอินใช้โครงสร้างแบนตามของเดิม: `spreadsheet.js` ดูแล panel/controller, `spreadsheet-commands.js` เก็บคำสั่ง Office ที่ serialize ได้โดยไม่พึ่ง closure ภายนอก และ `spreadsheet-selection.js` เก็บตัวช่วยตำแหน่งเซลล์/การเลือก field เช่นเดียวกับที่ DOCX แยก `document-commands.js` ออกจาก panel

ฝั่ง Web ใช้ editor เดียวกัน ไฟล์ `features/onlyoffice/editor-window-source.ts` อยู่กับ protocol/surface เพราะทำหน้าที่ตรวจ iframe/source ระหว่าง reconnect ไม่ต้องสร้าง editor อีกชุดสำหรับ Excel

`components/onlyoffice-editor.tsx` รับ `onDocumentStateChange` จาก ONLYOFFICE เพื่อแจ้งว่าผู้ใช้แก้ XLSX แล้ว หน้า fill ใช้สถานะนี้เตือนก่อนออกจากหน้า ส่วน `spreadsheet.js` ดูแลคำสั่งและผล Operation ไม่ใช้ event ของ DOCX ที่ Spreadsheet API ไม่รองรับ การทดสอบสถานะนี้อยู่ใน `web/test/ui/editor-reconnect.test.tsx`

## ตำแหน่งชุดทดสอบและเอกสาร

| สิ่งที่จะตรวจหรือบันทึก | ตำแหน่ง |
| --- | --- |
| HTTP และ transaction จริง | `server/test/http/` ใช้ DB/bucket แยกสำหรับทดสอบ |
| ขั้นตอน journey ของระบบเดิม | `server/test/scenarios/` และ fixtures ที่ใช้ร่วม |
| XLSX parser, protection, สูตร และ operation preparation | `server/test/spreadsheet-unit/` |
| การประมวลผลด้วย ONLYOFFICE จริง | `server/test/spreadsheet-runtime/` |
| plugin commands/panel/bridge | `onlyoffice-plugin/test/` |
| React UI | `web/test/ui/` |
| lifecycle ของหน้าเว็บ | `web/test/form-lifecycle.test.ts` |
| กติกา domain | `CONTEXT.md` |
| เหตุผลของการตัดสินใจสถาปัตยกรรมที่ยอมรับแล้ว | `docs/adr/` |
| spec/ticket/หลักฐานเฉพาะงาน | `.scratch/<feature>/` ตาม `docs/agents/issue-tracker.md` |

ใช้ root scripts `bun run fix`, `bun run check`, `bun run check-types` และ `bun run build` สำหรับตรวจรวม ส่วน spreadsheet scripts ระบุ source `*.test.ts` โดยตรงเพื่อไม่รันทดสอบซ้ำจาก `dist/` ที่ TypeScript สร้างไว้

`dist/`, `node_modules/`, Prisma generated client และ `web/src/routeTree.gen.ts` เป็นผลลัพธ์ที่สร้างใหม่ได้ ไม่ใช่ที่เก็บ source การเปลี่ยน schema ต้องมี migration ใหม่ ไม่แก้ migration ที่ใช้งานไปแล้ว และเอกสารอธิบายโครงสร้างต้องปรับตามโค้ดหลัง implementation เสร็จ
