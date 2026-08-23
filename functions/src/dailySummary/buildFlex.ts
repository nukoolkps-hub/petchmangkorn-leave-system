/**
 * Flex Bubble — สรุปประจำวัน "ใครหยุดวันนี้"
 *
 * Layout:
 * - Header: pastel bg ของวัน + วงกลม vivid ของวัน + หัวเรื่อง
 * - Body: คนหยุดวันนี้ (Leaves) — หรือ "ไม่มีพนักงานหยุดวันนี้"
 */

import { COLORS } from "../helpers/config.js";
import type { LinePushMessage } from "../types.js";
import type { ThaiDayName } from "./dateUtils.js";
import type { LeaveItem } from "./leaves.js";

const GOLD_PALE = COLORS.goldPale; // #F5E6C8
const MAROON = COLORS.maroon; // #7B1C1C
const CREAM = "#FFFDF5";
const CREAM_TINT = "#FFF8E7";
const TEXT_DK = "#3D2C20";
const TEXT_SOFT = "#9E8B7D";

/** สี header background — pastel ของวันในสัปดาห์ */
const DAY_PASTEL_BG: Record<ThaiDayName, string> = {
	อาทิตย์: "#FFCDD2", // ชมพูพาสเทล
	จันทร์: "#FFF59D", // เหลืองพาสเทล
	อังคาร: "#F8BBD0", // ชมพู
	พุธ: "#C8E6C9", // เขียวพาสเทล
	พฤหัสบดี: "#FFE0B2", // ส้มพาสเทล
	ศุกร์: "#BBDEFB", // ฟ้าพาสเทล
	เสาร์: "#E1BEE7", // ม่วงพาสเทล
};

/** สีวงกลมประจำวัน — vivid version (เด่นกว่า pastel background) */
const DAY_ACCENT: Record<ThaiDayName, string> = {
	อาทิตย์: "#E53935", // แดง
	จันทร์: "#FBC02D", // เหลือง
	อังคาร: "#EC407A", // ชมพูเข้ม
	พุธ: "#66BB6A", // เขียว
	พฤหัสบดี: "#FB8C00", // ส้ม
	ศุกร์: "#42A5F5", // ฟ้า
	เสาร์: "#8E24AA", // ม่วง
};

/** สีข้อความบน header pastel — ใช้สีเข้มให้อ่านง่าย */
const HEADER_TITLE = "#1A1A1A"; // ดำสนิท
const HEADER_SUB = "#3D2C20"; // น้ำตาลเข้ม

interface BuildFlexInput {
	groupName: string;
	dateStr: string; // "05/06/2026"
	dayName: ThaiDayName;
	leaves: LeaveItem[];
}

export function buildDailySummaryFlex(input: BuildFlexInput): LinePushMessage {
	const { groupName, dateStr, dayName, leaves } = input;
	const accent = DAY_ACCENT[dayName] || MAROON;
	const headerBg = DAY_PASTEL_BG[dayName] || GOLD_PALE;

	return {
		type: "flex",
		altText: `พนักงานหยุดวันนี้ (${dateStr}) — ${groupName}`,
		contents: {
			type: "bubble",
			size: "giga",
			header: buildHeader(groupName, dateStr, dayName, accent, headerBg),
			body: {
				type: "box",
				layout: "vertical",
				backgroundColor: CREAM,
				paddingAll: "14px",
				contents: [buildLeavesSection(leaves, accent)],
			},
		},
	};
}

/* ─── header — pastel bg ของวัน + วงกลม vivid + ตัวอักษรสีเข้ม ── */

function buildHeader(
	groupName: string,
	dateStr: string,
	dayName: ThaiDayName,
	accent: string,
	headerBg: string,
) {
	return {
		type: "box",
		layout: "horizontal",
		backgroundColor: headerBg,
		paddingAll: "0px",
		contents: [
			{
				type: "box",
				layout: "vertical",
				paddingAll: "20px",
				flex: 1,
				contents: [
					{
						type: "box",
						layout: "horizontal",
						alignItems: "center",
						contents: [
							{ type: "text", text: "🏆", size: "xxl", flex: 0 },
							{
								type: "box",
								layout: "vertical",
								paddingStart: "12px",
								contents: [
									{
										type: "text",
										text: "สรุปภารกิจประจำวัน",
										color: HEADER_TITLE,
										size: "lg",
										weight: "bold",
									},
									{
										type: "text",
										text: groupName,
										color: HEADER_SUB,
										size: "sm",
										weight: "bold",
									},
								],
							},
						],
					},
					{
						type: "box",
						layout: "horizontal",
						paddingTop: "10px",
						contents: [
							{
								type: "text",
								text: `📅 วัน${dayName}  ${dateStr}`,
								color: HEADER_SUB,
								size: "xs",
								weight: "bold",
							},
						],
					},
				],
			},
			{
				type: "box",
				layout: "vertical",
				justifyContent: "center",
				alignItems: "center",
				paddingEnd: "20px",
				flex: 0,
				contents: [
					{
						type: "box",
						layout: "vertical",
						backgroundColor: accent,
						width: "55px",
						height: "55px",
						cornerRadius: "28px",
						contents: [],
					},
				],
			},
		],
	};
}

/* ─── body — leaves section ─────────────────────────────────── */

function buildLeavesSection(
	leaves: LeaveItem[],
	accent: string,
): Record<string, unknown> {
	if (leaves.length === 0) {
		return {
			type: "box",
			layout: "vertical",
			backgroundColor: "#F5F5F5",
			cornerRadius: "8px",
			paddingAll: "12px",
			margin: "10px",
			contents: [
				{
					type: "text",
					text: "👥 ไม่มีพนักงานหยุดวันนี้",
					color: TEXT_SOFT,
					size: "sm",
					align: "center",
				},
			],
		};
	}

	const itemContents: Record<string, unknown>[] = [
		{
			type: "text",
			text: `👥 พนักงานหยุดวันนี้ (${leaves.length} คน)`,
			color: MAROON,
			size: "sm",
			weight: "bold",
		},
		{ type: "separator", margin: "10px", color: GOLD_PALE },
	];

	// รายชื่อ inline · format: "ชื่อ(ประเภทลา) ชื่อ(ประเภทลา) ..."
	// ไม่โชว์วันที่ (ลาหลายวัน) · กระชับใน 1 text · wrap อัตโนมัติถ้าเกิน
	const inlineList = leaves
		.map((leave) => `${leave.nickname}(${leave.kindLabel})`)
		.join(" ");
	itemContents.push({
		type: "box",
		layout: "vertical",
		backgroundColor: CREAM_TINT,
		cornerRadius: "8px",
		paddingAll: "10px",
		margin: "6px",
		contents: [
			{
				type: "text",
				text: inlineList,
				color: TEXT_DK,
				size: "sm",
				weight: "bold",
				wrap: true,
			},
		],
	});

	return {
		type: "box",
		layout: "vertical",
		margin: "10px",
		contents: itemContents,
	};
}
