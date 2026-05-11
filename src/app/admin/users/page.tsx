"use client";

import { FormEvent, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { AuthGuard } from "@/components/AuthGuard";
import { NavBar } from "@/components/NavBar";
import { useUsers } from "@/hooks/useUsers";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { logHistory } from "@/lib/history";
import type { UserRank, UserRole } from "@/types";

const ROLE_LABELS: Record<UserRole, string> = {
  special: "특별경계",
  supervisor: "당직 책임관",
  leader: "조장",
  member: "조원",
};

export default function UsersPage() {
  const { users } = useUsers();
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [rank, setRank] = useState<UserRank>("소방위");
  const [dept, setDept] = useState("행정과");
  const [role, setRole] = useState<UserRole>("member");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const maxIdx = users
      .filter((u) => u.role === role)
      .reduce((m, u) => Math.max(m, u.orderIndex), -1);
    await addDoc(collection(db, "users"), {
      name: name.trim(),
      rank,
      dept,
      role,
      orderIndex: maxIdx + 1,
      active: true,
    });
    await logHistory("user_added", session?.userId ?? null, { name, rank, role });
    setName("");
  };

  const toggleActive = async (id: string, active: boolean) => {
    await updateDoc(doc(db, "users", id), { active: !active });
    await logHistory(
      active ? "user_deactivated" : "user_updated",
      session?.userId ?? null,
      { userId: id }
    );
  };

  const changeRole = async (id: string, newRole: UserRole) => {
    const maxIdx = users
      .filter((u) => u.role === newRole)
      .reduce((m, u) => Math.max(m, u.orderIndex), -1);
    await updateDoc(doc(db, "users", id), { role: newRole, orderIndex: maxIdx + 1 });
    await logHistory("user_updated", session?.userId ?? null, { userId: id, role: newRole });
  };

  const remove = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "users", id));
    await logHistory("user_updated", session?.userId ?? null, {
      userId: id,
      action: "delete",
    });
  };

  const grouped: Record<UserRole, typeof users> = {
    supervisor: [],
    leader: [],
    member: [],
    special: [],
  };
  users.forEach((u) => grouped[u.role].push(u));

  return (
    <AuthGuard adminOnly>
      <NavBar />
      <main className="pb-20 px-3 pt-3 max-w-3xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">인원/순번 관리</h1>

        <form onSubmit={add} className="bg-white rounded-xl p-4 border space-y-2">
          <div className="font-semibold mb-1">신규 추가</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={rank}
              onChange={(e) => setRank(e.target.value as UserRank)}
              className="border rounded px-2 py-1.5 text-sm"
            >
              {(["소방령", "소방경", "소방위", "소방장", "소방교", "소방사"] as UserRank[]).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm"
            >
              {["행정과", "예방과", "재난과", "대응단"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {(["supervisor", "leader", "member", "special"] as UserRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button className="w-full bg-brand text-white py-1.5 rounded text-sm">
            추가
          </button>
        </form>

        {(
          [
            ["supervisor", "당직 책임관"],
            ["leader", "조장"],
            ["member", "조원"],
            ["special", "특별경계"],
          ] as const
        ).map(([roleKey, label]) => (
          <section key={roleKey} className="bg-white rounded-xl p-4 border">
            <div className="font-semibold mb-2">
              {label} ({grouped[roleKey].length})
            </div>
            {grouped[roleKey].length === 0 ? (
              <div className="text-sm text-gray-400">없음</div>
            ) : (
              <ul className="divide-y text-sm">
                {grouped[roleKey].map((u) => (
                  <li
                    key={u.id}
                    className="py-2 flex items-center gap-2 justify-between"
                  >
                    <div className={u.active ? "" : "text-gray-400 line-through"}>
                      <span className="text-xs text-gray-500 mr-2">
                        #{u.orderIndex + 1}
                      </span>
                      <span className="font-medium">{u.name}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        [{u.rank}] · {u.dept}
                      </span>
                    </div>
                    <div className="flex gap-1 items-center">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                        className="text-xs border px-1 py-1 rounded"
                      >
                        {(["supervisor", "leader", "member", "special"] as UserRole[]).map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => toggleActive(u.id, u.active)}
                        className="text-xs border px-2 py-1 rounded"
                      >
                        {u.active ? "비활성" : "활성"}
                      </button>
                      <button
                        onClick={() => remove(u.id)}
                        className="text-xs border px-2 py-1 rounded text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </AuthGuard>
  );
}
