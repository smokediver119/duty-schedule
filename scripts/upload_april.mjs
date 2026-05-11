import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDJdWnvVU-vP3ayB6x8oxkF3XgfQRYpuGQ",
  authDomain: "newjeans-d3807.firebaseapp.com",
  projectId: "newjeans-d3807",
  storageBucket: "newjeans-d3807.firebasestorage.app",
  messagingSenderId: "159898551171",
  appId: "1:159898551171:web:e6a955d5ee6882f60eecb6",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 엑셀에서 읽은 4월 당직 데이터
// 평일: shift=full, 토/일: shift=day(일직)/night(숙직)
const RAW = [
  { date: "2026-04-01", weekday: "수", type: "weekday",          slots: [{ shift: "full", sup: "김동순", lea: "배덕은",  mem: "심지우" }] },
  { date: "2026-04-02", weekday: "목", type: "weekday",          slots: [{ shift: "full", sup: "전기옥", lea: "이상범",  mem: "백승범" }] },
  { date: "2026-04-03", weekday: "금", type: "weekday",          slots: [{ shift: "full", sup: "유근성", lea: "윤지연",  mem: "허준희" }] },
  { date: "2026-04-04", weekday: "토", type: "weekend_or_holiday", slots: [
      { shift: "day",   sup: "김현태", lea: "유은귀",  mem: "김예리" },
      { shift: "night", sup: "서승찬", lea: "김경태",  mem: "최원길" },
  ]},
  { date: "2026-04-05", weekday: "일", type: "weekend_or_holiday", slots: [
      { shift: "day",   sup: "장정애", lea: "우영미",  mem: "김용직" },
      { shift: "night", sup: "서명원", lea: "남궁명",  mem: "박홍석" },
  ]},
  { date: "2026-04-06", weekday: "월", type: "weekday",          slots: [{ shift: "full", sup: "정병천", lea: "이민철",  mem: "홍경동" }] },
  { date: "2026-04-07", weekday: "화", type: "weekday",          slots: [{ shift: "full", sup: "박종범", lea: "이상범",  mem: "김상우" }] },
  { date: "2026-04-08", weekday: "수", type: "weekday",          slots: [{ shift: "full", sup: "박병철", lea: "문준기",  mem: "유영우" }] },
  { date: "2026-04-09", weekday: "목", type: "weekday",          slots: [{ shift: "full", sup: "전기옥", lea: "신상익",  mem: "백승범" }] },
  { date: "2026-04-10", weekday: "금", type: "weekday",          slots: [{ shift: "full", sup: "정병천", lea: "김경태",  mem: "허준희" }] },
  { date: "2026-04-11", weekday: "토", type: "weekend_or_holiday", slots: [
      { shift: "day",   sup: "정문규", lea: "김수옥",  mem: "양정태" },
      { shift: "night", sup: "유근성", lea: "남궁명",  mem: "조누리" },
  ]},
  { date: "2026-04-12", weekday: "일", type: "weekend_or_holiday", slots: [
      { shift: "day",   sup: "이지형", lea: "정민정",  mem: "유영우" },
      { shift: "night", sup: "서승찬", lea: "권수진",  mem: "백승범" },
  ]},
  { date: "2026-04-13", weekday: "월", type: "weekday",          slots: [{ shift: "full", sup: "서명원", lea: "배덕은",  mem: "최중덕" }] },
  { date: "2026-04-14", weekday: "화", type: "weekday",          slots: [{ shift: "full", sup: "박병철", lea: "김용훈",  mem: "양정태" }] },
  { date: "2026-04-15", weekday: "수", type: "weekday",          slots: [{ shift: "full", sup: "김용열", lea: "윤지연",  mem: "허준희" }] },
  { date: "2026-04-16", weekday: "목", type: "weekday",          slots: [{ shift: "full", sup: "박종범", lea: "유은귀",  mem: "김상우" }] },
  { date: "2026-04-17", weekday: "금", type: "weekday",          slots: [{ shift: "full", sup: "김동순", lea: "김경태",  mem: "장경재" }] },
  { date: "2026-04-18", weekday: "토", type: "weekend_or_holiday", slots: [
      { shift: "day",   sup: "정문규", lea: "이민철",  mem: "홍경동" },
      { shift: "night", sup: "정병천", lea: "김기범",  mem: "김상우" },
  ]},
  { date: "2026-04-19", weekday: "일", type: "weekend_or_holiday", slots: [
      { shift: "day",   sup: "전기옥", lea: "김수옥",  mem: "심지우" },
      { shift: "night", sup: "유근성", lea: "이상범",  mem: "김예리" },
  ]},
  { date: "2026-04-20", weekday: "월", type: "weekday",          slots: [{ shift: "full", sup: "서명원", lea: "문준기",  mem: "조누리" }] },
  { date: "2026-04-21", weekday: "화", type: "weekday",          slots: [{ shift: "full", sup: "서승찬", lea: "유은귀",  mem: "박홍석" }] },
  { date: "2026-04-22", weekday: "수", type: "weekday",          slots: [{ shift: "full", sup: "정문규", lea: "김규태",  mem: "최중덕" }] },
  { date: "2026-04-23", weekday: "목", type: "weekday",          slots: [{ shift: "full", sup: "이지형", lea: "권수진",  mem: "박홍석" }] },
  { date: "2026-04-24", weekday: "금", type: "weekday",          slots: [{ shift: "full", sup: "김용열", lea: "김용훈",  mem: "장경재" }] },
  { date: "2026-04-25", weekday: "토", type: "weekend_or_holiday", slots: [
      { shift: "day",   sup: "박종범", lea: "우영미",  mem: "최중덕" },
      { shift: "night", sup: "김동순", lea: "정민정",  mem: "양정태" },
  ]},
  { date: "2026-04-26", weekday: "일", type: "weekend_or_holiday", slots: [
      { shift: "day",   sup: "박병철", lea: "배덕은",  mem: "최원길" },
      { shift: "night", sup: "정병천", lea: "김기범",  mem: "김용직" },
  ]},
  { date: "2026-04-27", weekday: "월", type: "weekday",          slots: [{ shift: "full", sup: "전기옥", lea: "윤지연",  mem: "심지우" }] },
  { date: "2026-04-28", weekday: "화", type: "weekday",          slots: [{ shift: "full", sup: "유근성", lea: "신상익",  mem: "허준희" }] },
  { date: "2026-04-29", weekday: "수", type: "weekday",          slots: [{ shift: "full", sup: "이지형", lea: "김규태",  mem: "최원길" }] },
  { date: "2026-04-30", weekday: "목", type: "weekday",          slots: [{ shift: "full", sup: "서승찬", lea: "김수옥",  mem: "유영우" }] },
];

// Firebase에서 사용자 목록 가져와서 이름→ID 맵 생성
console.log("Firebase에서 사용자 정보 가져오는 중...");
const usersSnap = await getDocs(collection(db, "users"));
const nameToId = {};
usersSnap.forEach((d) => {
  const data = d.data();
  nameToId[data.name] = d.id;
});
console.log(`사용자 ${Object.keys(nameToId).length}명 로드 완료`);

// 이름이 없는 경우 체크
const missing = new Set();
for (const row of RAW) {
  for (const s of row.slots) {
    if (!nameToId[s.sup]) missing.add(s.sup);
    if (!nameToId[s.lea]) missing.add(s.lea);
    if (!nameToId[s.mem]) missing.add(s.mem);
  }
}
if (missing.size > 0) {
  console.error("❌ 다음 이름을 Firebase에서 찾을 수 없습니다:", [...missing]);
  process.exit(1);
}

// Duty 문서 생성
const duties = RAW.map((row) => ({
  id: row.date,
  date: row.date,
  weekday: row.weekday,
  type: row.type,
  assignments: row.slots.map((s) => ({
    shift: s.shift,
    supervisorId: nameToId[s.sup],
    leaderId: nameToId[s.lea],
    memberId: nameToId[s.mem],
  })),
}));

// Firebase에 일괄 저장
console.log("당직표 저장 중...");
const batch = writeBatch(db);
for (const d of duties) {
  batch.set(doc(db, "duties", d.id), d);
}
await batch.commit();

console.log(`✅ 2026년 4월 당직표 ${duties.length}일 저장 완료`);
process.exit(0);
