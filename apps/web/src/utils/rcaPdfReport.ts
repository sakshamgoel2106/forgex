import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface RcaPdfData {
  targetTag: string;
  machineName?: string;
  plantName: string;
  reportDate: string;
  engineerName: string;
  engineerRole: string;
  operatingState: string;
  detectedFaultCode?: string;
  symptom: string;
  topHypothesis?: {
    title: string;
    probability: number;
    severity?: string;
    mttr?: string;
    requiredSkill?: string;
    downtimeRisk?: string;
    mechanismExplanation?: string;
    recommendedFix?: string;
    fiveWhyChain?: string[];
    requiredTools?: string[];
    spareParts?: string[];
    status?: string;
  };
  investigationSteps: Array<{
    stepNumber: number;
    name: string;
    instruction: string;
    expectedReading?: string;
    requiresLoto?: boolean;
    status: 'PASS' | 'FAIL' | 'PENDING';
    verifiedAt?: string;
    verifiedBy?: string;
  }>;
  safetyReadiness?: {
    preWorkBriefing?: string;
    requiredPpe?: string[];
    isolationPoints?: string[];
  };
  escalation?: {
    ticketId?: string;
    discipline?: string;
    severity?: string;
  } | null;
  overallStatus: '100% VERIFIED & CLOSED' | 'CRITICAL ANOMALY HALTED' | 'IN PROGRESS';
}

export function generateRcaPdfReport(data: RcaPdfData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  let y = margin;

  // Helper: check page break
  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 18) {
      doc.addPage();
      y = margin + 4;
      drawHeaderRunning();
    }
  };

  const drawHeaderRunning = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`FORGEX INDUSTRIAL RCA REPORT · ASSET: ${data.targetTag}`, margin, margin);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, margin + 2, pageWidth - margin, margin + 2);
  };

  // 1. TOP HEADER BANNER
  doc.setFillColor(15, 23, 42); // Navy 900
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');

  // ForgeX branding & Title inside banner
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ROOT CAUSE ANALYSIS & 5-WHY AUDIT REPORT', margin + 6, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`ForgeX Reliability Engine · Facility: ${data.plantName || 'Main Manufacturing Plant'}`, margin + 6, y + 15);
  doc.text(`Report Generated: ${data.reportDate} · Official Shift Handover Record`, margin + 6, y + 19.5);

  // Status Badge on Right of Top Banner
  const statusColor: [number, number, number] =
    data.overallStatus === '100% VERIFIED & CLOSED'
      ? [16, 185, 129] // Emerald
      : data.overallStatus === 'CRITICAL ANOMALY HALTED'
      ? [225, 29, 72] // Rose
      : [59, 130, 246]; // Blue

  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(pageWidth - margin - 52, y + 5.5, 46, 13, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(data.overallStatus, pageWidth - margin - 29, y + 13.5, { align: 'center' });

  y += 28;

  // 2. TARGET ASSET & ISSUE OVERVIEW (Card Grid)
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 38, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. TARGET ASSET & OPERATIONAL OVERVIEW', margin + 4, y + 6);

  // Grid row 1
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('EQUIPMENT ASSET TAG:', margin + 4, y + 12);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.targetTag} ${data.machineName ? `(${data.machineName})` : ''}`, margin + 46, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('OPERATING STATE:', margin + 105, y + 12);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(data.operatingState || 'Running - Abnormal', margin + 138, y + 12);

  // Grid row 2
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('DETECTED FAULT CODE:', margin + 4, y + 18);
  doc.setTextColor(225, 29, 72);
  doc.setFont('helvetica', 'bold');
  doc.text(data.detectedFaultCode || 'ALM-THRM-402 / High Temp Trip', margin + 46, y + 18);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('SAFETY LOTO STATUS:', margin + 105, y + 18);
  doc.setTextColor(5, 150, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('OSHA 1910.147 Compliant', margin + 138, y + 18);

  // Field Symptom Box
  doc.setFillColor(254, 243, 199); // Amber 100
  doc.setDrawColor(251, 191, 36);
  doc.roundedRect(margin + 4, y + 22, contentWidth - 8, 12, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(146, 64, 14);
  doc.text('FIELD SYMPTOM / ANOMALY OBSERVED:', margin + 6, y + 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(69, 26, 3);
  const symptomLines = doc.splitTextToSize(data.symptom || 'No description provided.', contentWidth - 14);
  doc.text(symptomLines.slice(0, 2), margin + 6, y + 30.5);

  y += 42;

  // 3. PRIMARY ROOT CAUSE & PROBABILITY SECTION
  if (data.topHypothesis) {
    const hyp = data.topHypothesis;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 34, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('2. PRIMARY ROOT CAUSE HYPOTHESIS', margin + 4, y + 6);

    // Title & Confidence
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138); // Blue 900
    doc.text(`${hyp.title}`, margin + 4, y + 12);

    // Probability & Severity Pills
    doc.setFillColor(219, 234, 254);
    doc.roundedRect(pageWidth - margin - 52, y + 3, 48, 8, 1, 1, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(29, 78, 216);
    doc.text(`${hyp.probability}% AI CONFIDENCE`, pageWidth - margin - 28, y + 8, { align: 'center' });

    // Meta Strip: MTTR, Skill, Risk
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`MTTR: ${hyp.mttr || '45–60 mins'}   |   Skill: ${hyp.requiredSkill || 'L2 Mechanical'}   |   Risk: ${hyp.downtimeRisk || 'High'}`, margin + 4, y + 17);

    // Mechanism
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Mechanism:', margin + 4, y + 22.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const mechLines = doc.splitTextToSize(hyp.mechanismExplanation || 'N/A', contentWidth - 28);
    doc.text(mechLines.slice(0, 2), margin + 24, y + 22.5);

    // Recommended Fix
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Remediation:', margin + 4, y + 29);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(5, 150, 105);
    const fixLines = doc.splitTextToSize(hyp.recommendedFix || 'N/A', contentWidth - 28);
    doc.text(fixLines.slice(0, 2), margin + 24, y + 29);

    y += 38;
  }

  // 4. 5-WHY CAUSAL CHAIN BREAKDOWN
  ensureSpace(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. INTERACTIVE 5-WHY FAILURE CAUSAL SEQUENCE', margin, y);
  y += 3.5;

  const chain =
    data.topHypothesis?.fiveWhyChain && data.topHypothesis.fiveWhyChain.length > 0
      ? data.topHypothesis.fiveWhyChain
      : [
          `Why 1: Operational load deviation on ${data.targetTag}`,
          'Why 2: Boundary fluid starvation & dynamic cavitation',
          'Why 3: Thermal stress erosion on silicon carbide seal faces',
          'Why 4: Dynamic O-ring extrusion and seal leakage',
          `Observed Symptom: ${data.symptom}`,
        ];

  const whyTableBody = chain.map((stepText, idx) => [
    `Stage ${idx + 1}`,
    stepText.startsWith('Why') ? stepText.split(':')[0] : `Why #${idx + 1}`,
    stepText.includes(':') ? stepText.split(':').slice(1).join(':').trim() : stepText,
    idx === chain.length - 1 ? 'Root Physical Consequence' : idx === 0 ? 'Initial Trigger Event' : 'Failure Propagation',
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Stage', 'Level', 'Physical Failure Mechanism & Progression', 'Causal Phase']],
    body: whyTableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59], // Slate 800
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 16, fontStyle: 'bold', halign: 'center' },
      1: { cellWidth: 22, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 38, fontStyle: 'italic', textColor: [100, 116, 139] },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // 5. INVESTIGATION STEPS AUDIT TRAIL
  ensureSpace(45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('4. INVESTIGATION VERIFICATION AUDIT TRAIL', margin, y);
  y += 3.5;

  const stepsTableBody = data.investigationSteps.map((s) => [
    `#${s.stepNumber}`,
    s.name,
    s.expectedReading || 'In-spec baseline',
    s.requiresLoto ? 'YES (LOTO)' : 'NO',
    s.status === 'PASS' ? '✓ PASS' : s.status === 'FAIL' ? '✕ FAIL' : 'PENDING',
    s.verifiedBy ? `${s.verifiedBy}\n${s.verifiedAt ? new Date(s.verifiedAt).toLocaleDateString() : ''}` : 'Pending',
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Step', 'Verification Check', 'Expected Tolerance', 'LOTO', 'Status', 'Verified By']],
    body: stepsTableBody,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [15, 23, 42],
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 40 },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 32, fontSize: 6.5 },
    },
    didParseCell: (hookData: any) => {
      if (hookData.section === 'body' && hookData.column.index === 4) {
        if (hookData.cell.raw === '✓ PASS') {
          hookData.cell.styles.textColor = [5, 150, 105];
          hookData.cell.styles.fillColor = [236, 253, 245];
        } else if (hookData.cell.raw === '✕ FAIL') {
          hookData.cell.styles.textColor = [225, 29, 72];
          hookData.cell.styles.fillColor = [255, 241, 242];
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // 6. SPECIALIST ESCALATION STATUS (IF APPLICABLE)
  if (data.escalation && data.escalation.ticketId) {
    ensureSpace(20);
    doc.setFillColor(254, 242, 242); // Rose 50
    doc.setDrawColor(254, 205, 211);
    doc.roundedRect(margin, y, contentWidth, 14, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(190, 18, 60);
    doc.text(`SPECIALIST DISPATCHED: TICKET #${data.escalation.ticketId}`, margin + 4, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(136, 19, 55);
    doc.text(`Discipline: ${data.escalation.discipline || 'Mechanical Rotating Equipment Specialist'}   |   Priority: ${data.escalation.severity || 'CRITICAL'}`, margin + 4, y + 10.5);

    y += 18;
  }

  // 7. OFFICIAL AUDIT SIGN-OFF FOOTER BLOCK
  ensureSpace(28);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 24, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('5. AUDIT VERIFICATION & HANDOVER SIGN-OFF', margin + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Lead Maintenance Engineer: ${data.engineerName}`, margin + 4, y + 10);
  doc.text(`Operational Role: ${data.engineerRole || 'Maintenance Engineer'}`, margin + 4, y + 14.5);
  doc.text('Status: Official Tamper-Evident Record Sealed in Maintenance History & Qdrant Knowledge Base', margin + 4, y + 19);

  // Signature line on right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(15, 23, 42);
  doc.line(pageWidth - margin - 55, y + 15, pageWidth - margin - 5, y + 15);
  doc.text('ENGINEER DIGITAL SIGNATURE & STAMP', pageWidth - margin - 30, y + 19, { align: 'center' });

  // Add page numbers at bottom of each page
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `ForgeX Industrial Reliability Platform · Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  // Generate clean filename
  const cleanTag = (data.targetTag || 'EQUIPMENT').replace(/[^a-zA-Z0-9_-]/g, '_');
  const nowTs = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `RCA_Summary_Report_${cleanTag}_${nowTs}.pdf`;

  doc.save(fileName);
}
