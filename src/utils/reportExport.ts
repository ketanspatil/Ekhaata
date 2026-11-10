import jsPDF from "jspdf";
import { DBFinancialReportSummary } from "@/services/databaseLedgerService";

/**
 * Generates and downloads a clean, professional PDF financial report for Ekhaata.
 * Includes:
 * - Shop Name & Header branding
 * - Generation Date & Reporting Period (IST)
 * - Financial summary cards (Credit, Payment, Net Balance)
 * - Customer breakdown table (Customer, Phone, Credit, Payment, Balance)
 * - Recent transaction log
 */
export function exportReportToPDF(report: DBFinancialReportSummary) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 18;

  // 1. Header Banner & Branding
  doc.setFillColor(19, 78, 57); // #134E39 (Ekhaata Forest Green)
  doc.rect(0, 0, pageWidth, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("EKHAATA (ई-खाता)", 14, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Vyapar Khata Report • ${report.shopName}`,
    14,
    18
  );

  const periodLabel =
    report.period === "daily"
      ? "Daily Summary (Aaj Ka Hisaab)"
      : report.period === "weekly"
      ? "Weekly Summary (Hafte Ka Hisaab)"
      : "Monthly Udhaar Report (Mahine Ka Hisaab)";

  doc.setFontSize(9);
  doc.text(`Period: ${periodLabel}`, pageWidth - 14, 12, { align: "right" });
  doc.text(
    `Date: ${new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`,
    pageWidth - 14,
    18,
    { align: "right" }
  );

  y = 38;

  // 2. Financial Overview Cards
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("1. Financial Summary / Vitthiya Vivaran", 14, y);
  y += 6;

  // Card 1: Total Credit Given (Udhaar)
  doc.setFillColor(254, 242, 242); // Light red
  doc.setDrawColor(254, 202, 202);
  doc.roundedRect(14, y, 56, 22, 2, 2, "FD");
  doc.setFontSize(8);
  doc.setTextColor(185, 28, 28);
  doc.text("TOTAL CREDIT (UDHAAR)", 18, y + 6);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`Rs. ${report.totalCreditRupees.toLocaleString("en-IN")}`, 18, y + 16);

  // Card 2: Total Payments Received (Jama)
  doc.setFillColor(236, 253, 245); // Light emerald
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(74, y, 56, 22, 2, 2, "FD");
  doc.setFontSize(8);
  doc.setTextColor(4, 120, 87);
  doc.text("TOTAL PAYMENTS (JAMA)", 78, y + 6);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`Rs. ${report.totalPaymentRupees.toLocaleString("en-IN")}`, 78, y + 16);

  // Card 3: Net Outstanding / Balance
  doc.setFillColor(243, 244, 246); // Light gray
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(134, y, 62, 22, 2, 2, "FD");
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81);
  doc.text("NET BALANCE / PENDING", 138, y + 6);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`Rs. ${report.netPendingRupees.toLocaleString("en-IN")}`, 138, y + 16);

  y += 28;

  // Stats Sub-bar
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(
    `Total Transactions: ${report.transactionCount}    |    Pending Customers: ${report.pendingCustomersCount}`,
    14,
    y
  );
  y += 8;

  // 3. Customer Breakdown Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text(
    report.period === "monthly"
      ? "2. Monthly Pending Udhaar by Customer"
      : "2. Customer Account Summary",
    14,
    y
  );
  y += 6;

  // Table Header
  doc.setFillColor(240, 240, 240);
  doc.rect(14, y, pageWidth - 28, 8, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 60, 60);
  doc.text("CUSTOMER NAME", 18, y + 5.5);
  doc.text("PHONE", 75, y + 5.5);
  doc.text("CREDIT (Rs.)", 110, y + 5.5, { align: "right" });
  doc.text("PAYMENT (Rs.)", 145, y + 5.5, { align: "right" });
  doc.text("BALANCE (Rs.)", 190, y + 5.5, { align: "right" });
  y += 9;

  // Table Rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  const customerList = report.customers.slice(0, 30); // Show up to top 30 customers on page
  if (customerList.length === 0) {
    doc.setTextColor(130, 130, 130);
    doc.text("No customer activity recorded for this period.", 18, y + 5);
    y += 10;
  } else {
    for (const c of customerList) {
      if (y > pageHeight - 25) {
        doc.addPage();
        y = 20;
      }

      doc.setTextColor(30, 30, 30);
      doc.text(c.customerName || "Grahak", 18, y);
      doc.setTextColor(110, 110, 110);
      doc.text(c.phone || "-", 75, y);

      doc.setTextColor(185, 28, 28);
      doc.text(c.creditRupees.toLocaleString("en-IN"), 110, y, { align: "right" });

      doc.setTextColor(4, 120, 87);
      doc.text(c.paymentRupees.toLocaleString("en-IN"), 145, y, { align: "right" });

      const isPositive = c.balanceRupees > 0;
      doc.setTextColor(isPositive ? 185 : 4, isPositive ? 28 : 120, isPositive ? 28 : 87);
      doc.setFont("helvetica", "bold");
      doc.text(
        isPositive
          ? `+${c.balanceRupees.toLocaleString("en-IN")}`
          : `${c.balanceRupees.toLocaleString("en-IN")}`,
        190,
        y,
        { align: "right" }
      );
      doc.setFont("helvetica", "normal");

      // subtle separator line
      doc.setDrawColor(240, 240, 240);
      doc.line(14, y + 2.5, pageWidth - 14, y + 2.5);
      y += 7.5;
    }
  }

  // 4. Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Ekhaata Voice Ledger • Powered by Google Gemini & Supabase • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  // Save the PDF
  const filename = `Ekhaata_${report.shopName.replace(/\s+/g, "_")}_${report.period}_${Date.now()}.pdf`;
  doc.save(filename);
}

/**
 * Formats a clean, readable financial summary string for sharing over WhatsApp.
 */
export function generateWhatsAppReportText(report: DBFinancialReportSummary): string {
  const periodTitle =
    report.period === "daily"
      ? "📅 *DAINIK HISAAB SUMMARY (DAILY REPORT)*"
      : report.period === "weekly"
      ? "📅 *SAAPTAAHIK HISAAB SUMMARY (WEEKLY REPORT)*"
      : "📅 *MAHEENE KA UDHAAR REPORT (MONTHLY REPORT)*";

  const dateStr = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  let message = `${periodTitle}\n`;
  message += `🏪 *Dukaan:* ${report.shopName}\n`;
  message += `🗓️ *Taareekh:* ${dateStr}\n`;
  message += `──────────────────\n`;
  message += `💰 *Kul Diya Udhaar (Credit):* ₹${report.totalCreditRupees.toLocaleString("en-IN")}\n`;
  message += `💵 *Kul Prapt Jama (Payment):* ₹${report.totalPaymentRupees.toLocaleString("en-IN")}\n`;
  message += `📊 *Net Baki / Pending:* ₹${report.netPendingRupees.toLocaleString("en-IN")}\n`;
  message += `📝 *Kul Len-Den:* ${report.transactionCount} transactions\n`;
  message += `👥 *Baki Wale Grahak:* ${report.pendingCustomersCount} grahak\n`;
  message += `──────────────────\n`;

  // Top pending customers
  const pendingCusts = report.customers.filter((c) => c.balanceRupees > 0).slice(0, 10);
  if (pendingCusts.length > 0) {
    message += `📋 *Baki Udhaar Wale Mukhya Grahak:*\n`;
    pendingCusts.forEach((c, idx) => {
      message += `${idx + 1}. *${c.customerName}:* ₹${c.balanceRupees.toLocaleString("en-IN")}\n`;
    });
    if (report.customers.filter((c) => c.balanceRupees > 0).length > 10) {
      message += `_...aur anya grahak_\n`;
    }
  } else {
    message += `✅ *Sabhi grahako ka hisaab barabar hai!*\n`;
  }

  message += `──────────────────\n`;
  message += `📱 _Generated via Ekhaata Voice Ledger_`;

  return message;
}

/**
 * Triggers a WhatsApp share dialog or opens WhatsApp Web / App with prefilled text.
 */
export function shareViaWhatsApp(report: DBFinancialReportSummary) {
  const text = generateWhatsAppReportText(report);
  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText}`;

  // Open in new window/tab
  if (typeof window !== "undefined") {
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }
}

