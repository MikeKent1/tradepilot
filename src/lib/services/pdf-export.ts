'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AnalyticsData } from '@/lib/hooks/use-analytics-data';
import { formatCurrency, formatPercent } from '@/lib/utils';

export function generateAnalyticsPdf(
  data: AnalyticsData,
  options?: { title?: string; author?: string },
): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 20;

  // ── Header ──────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 40);
  const title = options?.title || 'TradePilot Analytics Report';
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 140);
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.text(`Generated: ${date}`, pageWidth / 2, y, { align: 'center' });
  y += 12;

  // Horizontal divider
  doc.setDrawColor(220, 220, 230);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // ── Section: Key Metrics ────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 40);
  doc.text('Key Performance Metrics', margin, y);
  y += 8;

  const kpiData = [
    ['Total Trades', data.totalTrades.toString(), 'Win Rate', formatPercent(data.winRate)],
    ['Winning Trades', data.winningTrades.toString(), 'Loss Rate', formatPercent(1 - data.winRate)],
    ['Losing Trades', data.losingTrades.toString(), 'Total P&L', formatCurrency(data.totalPnl)],
    ['Profit Factor', data.profitFactor === Infinity ? '∞' : `${data.profitFactor.toFixed(2)}x`, 'Avg Win', formatCurrency(data.avgWin)],
    ['Largest Win', formatCurrency(data.largestWin), 'Avg Loss', formatCurrency(data.avgLoss)],
    ['Largest Loss', formatCurrency(data.largestLoss), '', ''],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value', 'Metric', 'Value']],
    body: kpiData,
    theme: 'grid',
    headStyles: {
      fillColor: [99, 102, 241],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [40, 40, 60],
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 255],
    },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
      1: { cellWidth: 35 },
      2: { fontStyle: 'bold', cellWidth: 40 },
      3: { cellWidth: 35 },
    },
    tableLineColor: [210, 210, 220],
    tableLineWidth: 0.3,
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // ── Section: P&L by Symbol ──────────────────────────────
  if (data.pnlBySymbol.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 40);
    doc.text('P&L by Symbol', margin, y);
    y += 8;

    const symbolData = data.pnlBySymbol.map((s) => [
      s.symbol,
      s.name || '',
      s.trades.toString(),
      formatCurrency(s.pnl),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Symbol', 'Name', 'Trades', 'P&L']],
      body: symbolData,
      theme: 'grid',
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [40, 40, 60],
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 255],
      },
      margin: { left: margin, right: margin },
      columnStyles: {
        3: { halign: 'right' },
      },
      didDrawCell: (hookData) => {
        if (hookData.column.index === 3 && hookData.cell.raw) {
          const val = hookData.cell.raw as string;
          if (val.startsWith('-')) {
            (hookData.cell as any).styles.textColor = [239, 68, 68];
          } else if (val !== '$0.00') {
            (hookData.cell as any).styles.textColor = [16, 185, 129];
          }
        }
      },
      tableLineColor: [210, 210, 220],
      tableLineWidth: 0.3,
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // ── Section: Monthly P&L ────────────────────────────────
  if (data.monthlyPnl.length > 0) {
    // Check if we need a new page
    if (y > 220) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 40);
    doc.text('Monthly P&L', margin, y);
    y += 8;

    const monthlyData = data.monthlyPnl.map((m) => [
      m.month,
      m.trades.toString(),
      `${m.winRate}%`,
      formatCurrency(m.pnl),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Month', 'Trades', 'Win Rate', 'P&L']],
      body: monthlyData,
      theme: 'grid',
      headStyles: {
        fillColor: [245, 158, 11],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [40, 40, 60],
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 255],
      },
      margin: { left: margin, right: margin },
      columnStyles: {
        3: { halign: 'right' },
      },
      didDrawCell: (hookData) => {
        if (hookData.column.index === 3 && hookData.cell.raw) {
          const val = hookData.cell.raw as string;
          if (val.startsWith('-')) {
            (hookData.cell as any).styles.textColor = [239, 68, 68];
          } else if (val !== '$0.00') {
            (hookData.cell as any).styles.textColor = [16, 185, 129];
          }
        }
      },
      tableLineColor: [210, 210, 220],
      tableLineWidth: 0.3,
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // ── Section: Trade Journal ──────────────────────────────
  if (data.trades.length > 0) {
    if (y > 200) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 40);
    doc.text('Trade Journal', margin, y);
    y += 8;

    // Column headers: Date, Symbol, Type, Qty, Price, Fee, P&L
    const tradeRows = data.trades.slice(0, 200).map((t) => [
      t.executed_at.substring(0, 10),
      t.symbol,
      t.type.toUpperCase(),
      t.quantity.toString(),
      formatCurrency(t.price),
      formatCurrency(t.fee ?? 0),
      formatCurrency(t.pnl ?? 0),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Symbol', 'Type', 'Qty', 'Price', 'Fee', 'P&L']],
      body: tradeRows,
      theme: 'grid',
      headStyles: {
        fillColor: [99, 102, 241],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [40, 40, 60],
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 255],
      },
      margin: { left: margin, right: margin },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
      didDrawCell: (hookData) => {
        if (hookData.column.index === 6 && hookData.cell.raw) {
          const val = hookData.cell.raw as string;
          if (val.startsWith('-')) {
            (hookData.cell as any).styles.textColor = [239, 68, 68];
          } else if (val !== '$0.00') {
            (hookData.cell as any).styles.textColor = [16, 185, 129];
          }
        }
      },
      tableLineColor: [210, 210, 220],
      tableLineWidth: 0.3,
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Footer ──────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 170);
    doc.text(
      `TradePilot Analytics — Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' },
    );
  }

  // Set document metadata
  doc.setProperties({
    title: title,
    author: options?.author || 'TradePilot',
    subject: 'Trading Analytics Report',
    creator: 'TradePilot PDF Export',
  });

  return doc;
}

export function downloadAnalyticsPdf(
  data: AnalyticsData,
  filename?: string,
): void {
  const doc = generateAnalyticsPdf(data);
  const fileName = filename || `tradepilot-analytics-${new Date().toISOString().substring(0, 10)}.pdf`;
  doc.save(fileName);
}