/* ─── LINE Bot Commands Panel ──────────────────────────────────
   แสดงรายการ command ทั้งหมดที่ bot รับ + คำอธิบาย + scope
   (sync มาจาก functions/src/line/commands/help.ts — ถ้าเพิ่ม/แก้
   ที่ฝั่ง Cloud Function ต้อง update ที่นี่ด้วย)                            */

import {
  Bell as IconBell,
  Lock as IconLock,
  MessageCircle as IconMessageCircle,
  Terminal as IconTerminal,
  User as IconUser,
  Users as IconUsers,
} from "lucide-react";

type Scope = "แชทส่วนตัว" | "กลุ่ม";

interface BotCommand {
  command: string;
  description: string;
  scope: Scope;
  admin?: boolean; // true = ใช้ได้เฉพาะ admin
  example?: string;
}

const COMMANDS: BotCommand[] = [
  {
    command: "ไอดีฉัน",
    description: "ดู LINE User ID ของตัวเอง — ใช้ส่งให้ ADMIN เพื่อเชื่อมบัญชี",
    scope: "แชทส่วนตัว",
  },
  {
    command: "คำสั่ง",
    description: "ดูคำสั่งทั้งหมดในรูป flex card",
    scope: "แชทส่วนตัว",
    admin: true,
  },
  {
    command: "ไอดีกลุ่ม",
    description: "ดู Group/Room ID ของกลุ่มที่อยู่ — ใช้ตั้ง config notification",
    scope: "กลุ่ม",
    admin: true,
  },
  {
    command: "@บอท ไอดี @ผู้ใช้ไลน์",
    description: "ดูไอดี LINE ของผู้ใช้คนที่ถูกแท็ก",
    scope: "กลุ่ม",
    admin: true,
    example: "@บอท ไอดี @สมชาย",
  },
  {
    command: "@บอท เชื่อมพนักงาน @พนักงาน",
    description: "เชื่อม LINE ของผู้ที่ถูกแท็กเข้ากับบัญชีพนักงานที่มีอยู่",
    scope: "กลุ่ม",
    admin: true,
    example: "@บอท เชื่อมพนักงาน @ซามูไร",
  },
  {
    command: "@บอท เชื่อมพนักงาน @ผู้ใช้ไลน์ ชื่อพนักงาน",
    description: "เชื่อม LINE หรือสร้างพนักงานใหม่ด้วยชื่อที่ระบุ",
    scope: "กลุ่ม",
    admin: true,
    example: "@บอท เชื่อมพนักงาน @somchai สมชาย",
  },
  {
    command: "ทดสอบแจ้งเตือน",
    description:
      "Bot push ตัวอย่างสรุปเช้า (ใครหยุดวันนี้) มาให้ดูทันที — ใช้ทดสอบก่อน 07:30",
    scope: "แชทส่วนตัว",
    admin: true,
  },
];

export default function LineBotCommandsPanel() {
  const personalCommands = COMMANDS.filter((c) => c.scope === "แชทส่วนตัว");
  const groupCommands = COMMANDS.filter((c) => c.scope === "กลุ่ม");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <IconTerminal size={18} strokeWidth={2.4} className="text-maroon" />
        <h2 className="text-lg font-extrabold text-txt">คำสั่งของ Bot</h2>
      </div>
      <p className="text-sm text-txt-soft mb-4 leading-relaxed">
        รวมคำสั่งทั้งหมดที่ bot ตอบ — แยกตาม scope ที่ใช้ได้.{" "}
        <span className="inline-flex items-center gap-1 ml-1">
          <IconLock size={11} strokeWidth={2.6} className="text-maroon" />
          <span className="text-xs font-bold text-maroon">ADMIN only</span>
        </span>{" "}
        = ใช้ได้เฉพาะ ADMIN
      </p>

      <CommandGroup
        icon={IconUser}
        title="แชทส่วนตัว (1:1 กับบอท)"
        description="พิมพ์ในแชทส่วนตัวกับบอทเท่านั้น"
        commands={personalCommands}
      />

      <div className="mt-5">
        <CommandGroup
          icon={IconUsers}
          title="กลุ่ม / ห้องแชท"
          description="พิมพ์ในกลุ่ม LINE ที่บอทอยู่ — บางคำสั่งต้อง @บอท ก่อน"
          commands={groupCommands}
        />
      </div>
    </div>
  );
}

function CommandGroup({
  icon: Icon,
  title,
  description,
  commands,
}: {
  icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  title: string;
  description: string;
  commands: BotCommand[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={14} strokeWidth={2.4} className="text-maroon" />
        <div className="text-sm font-bold text-maroon">{title}</div>
      </div>
      <div className="text-xs text-txt-soft mb-2.5">{description}</div>
      <div className="flex flex-col gap-2">
        {commands.map((cmd) => (
          <CommandCard key={cmd.command} command={cmd} />
        ))}
      </div>
    </div>
  );
}

function CommandCard({ command }: { command: BotCommand }) {
  return (
    <div className="px-3.5 py-3 rounded-[12px] border-[1.5px] border-gold/30 bg-cream">
      <div className="flex items-center gap-2 mb-1.5">
        <IconMessageCircle
          size={13}
          strokeWidth={2.4}
          className="text-maroon shrink-0"
        />
        <code className="text-sm font-bold text-maroon font-[Prompt,monospace] tracking-tight">
          {command.command}
        </code>
        {command.admin && (
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-[6px] bg-maroon/10 text-maroon text-xs font-bold">
            <IconLock size={10} strokeWidth={2.6} />
            admin
          </span>
        )}
      </div>
      <div className="text-xs text-txt-mid leading-relaxed">
        {command.description}
      </div>
      {command.example && (
        <div className="mt-1.5 text-xs text-txt-soft inline-flex items-center gap-1">
          <IconBell size={10} strokeWidth={2.4} />
          ตัวอย่าง:{" "}
          <code className="font-[Prompt,monospace] text-txt-mid">
            {command.example}
          </code>
        </div>
      )}
    </div>
  );
}
