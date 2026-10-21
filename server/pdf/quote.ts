import fs from "fs";
import path from "path";
import { createElement as h, type ReactElement } from "react";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View, type Styles } from "@react-pdf/renderer";
import type { QuoteContent } from "../services/quotes";

// Plain createElement rather than JSX: the server build doesn't transform JSX.

// The logo on quotes and invoices. Swap the file to change it: any square PNG or JPG.
const LOGO_PATH = path.resolve(process.cwd(), "server/assets/logo.png");
let logo: Buffer | null | undefined;
const loadLogo = () => (logo === undefined ? (logo = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null) : logo);

const INK = "#0E0F12";
const MUTED = "#5B606B";
const RULE = "#D9DCE1";
const AMBER = "#FFB020";

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 56, paddingHorizontal: 48, fontFamily: "Helvetica", fontSize: 10, color: INK },
  // Set on each Text rather than the page: a page-wide lineHeight stops the page number rendering.
  text: { fontSize: 10, lineHeight: 1.3 },
  band: { height: 6, backgroundColor: AMBER, marginHorizontal: -48, marginBottom: 28 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 22 },
  brand: { flexDirection: "row", alignItems: "center" },
  logo: { width: 48, height: 48, marginRight: 12, borderRadius: 8 },
  name: { fontFamily: "Helvetica-Bold", fontSize: 14 },
  muted: { color: MUTED },
  title: { fontFamily: "Helvetica-Bold", fontSize: 22, textAlign: "right", letterSpacing: 1, lineHeight: 1, marginBottom: 8 },
  fact: { flexDirection: "row", justifyContent: "flex-end" },
  factLabel: { color: MUTED, marginRight: 8 },
  columns: { flexDirection: "row", marginBottom: 16 },
  column: { flex: 1, paddingRight: 16 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 8, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  strong: { fontFamily: "Helvetica-Bold" },
  period: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: RULE, paddingVertical: 6, marginBottom: 16 },
  periodCell: { flex: 1, paddingRight: 12 },
  tableHead: { flexDirection: "row", borderBottomWidth: 1, borderColor: INK, paddingBottom: 4, marginBottom: 2 },
  section: { fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 1 },
  row: { flexDirection: "row", paddingVertical: 2, borderBottomWidth: 0.5, borderColor: RULE },
  description: { flex: 1, paddingRight: 8 },
  quantity: { width: 40, textAlign: "right" },
  each: { width: 80, textAlign: "right" },
  amount: { width: 80, textAlign: "right" },
  total: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10, paddingTop: 6, borderTopWidth: 1.5, borderColor: INK },
  totalText: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  totalAmount: { fontFamily: "Helvetica-Bold", fontSize: 12, width: 100, textAlign: "right" },
  schedule: { marginTop: 18 },
  scheduleRow: { flexDirection: "row", paddingVertical: 2, borderBottomWidth: 0.5, borderColor: RULE },
  scheduleLabel: { width: 140 },
  scheduleWhen: { flex: 1, color: MUTED },
  scheduleAmount: { width: 80, textAlign: "right" },
  notes: { marginTop: 18 },
  footer: { position: "absolute", bottom: 24, left: 48, fontSize: 8, color: MUTED },
  pageNumber: { position: "absolute", bottom: 24, left: 48, right: 48, textAlign: "right", fontSize: 8, color: MUTED },
});

type Style = Styles[string];
const text = (style: Style | Style[], value: string) => h(Text, { style: [s.text, style].flat() }, value);

function lines(heading: string, values: string[]) {
  return h(
    View,
    { style: s.column },
    text(s.heading, heading),
    ...values.map((v, i) => text(i === 0 ? s.strong : {}, v)),
  );
}

function quoteDocument(c: QuoteContent): ReactElement {
  const header = h(
    View,
    { style: s.header },
    h(
      View,
      { style: s.brand },
      loadLogo() ? h(Image, { style: s.logo, src: loadLogo()! }) : null,
      h(View, null, text(s.name, c.business.name), text(s.muted, c.business.email), text(s.muted, c.business.phone)),
    ),
    h(
      View,
      null,
      text(s.title, c.title.toUpperCase()),
      ...c.facts.map(([label, value]) => h(View, { key: label, style: s.fact }, text(s.factLabel, label), text(s.strong, value))),
    ),
  );

  const parties = h(View, { style: s.columns }, lines(c.document === "quote" ? "Prepared for" : "Bill to", c.customer), lines("Event", c.event));

  const period = h(
    View,
    { style: s.period },
    ...c.period.map(([label, value]) => h(View, { key: label, style: s.periodCell }, text(s.heading, label), text({}, value))),
  );

  const table = h(
    View,
    null,
    h(
      View,
      { style: s.tableHead, fixed: true },
      text([s.description, s.heading], "Description"),
      text([s.quantity, s.heading], "Qty"),
      text([s.each, s.heading], "Each"),
      text([s.amount, s.heading], "Amount"),
    ),
    ...c.sections.map((section) =>
      h(
        View,
        { key: section.title },
        text(s.section, section.title),
        ...section.rows.map((r, i) =>
          h(
            View,
            { key: i, style: s.row, wrap: false },
            text(s.description, r.description),
            text(s.quantity, String(r.quantity)),
            text(s.each, r.each),
            text(s.amount, r.amount),
          ),
        ),
      ),
    ),
    h(View, { style: s.total, wrap: false }, text(s.totalText, "Total"), text(s.totalAmount, c.total)),
  );

  const schedule = c.schedule
    ? h(
        View,
        { style: s.schedule, wrap: false },
        text(s.heading, c.schedule.title),
        ...(c.schedule.rows.length === 0 ? [text(s.muted, "No payments yet.")] : []),
        ...c.schedule.rows.map(([label, amount, when], i) =>
          h(View, { key: i, style: s.scheduleRow }, text(s.scheduleLabel, label), text(s.scheduleWhen, when), text(s.scheduleAmount, amount)),
        ),
        c.schedule.footer &&
          h(
            View,
            { style: s.total },
            text(s.totalText, c.schedule.footer[0]),
            text(s.totalAmount, c.schedule.footer[1]),
          ),
      )
    : null;

  const notes = h(View, { style: s.notes, wrap: false }, text({}, c.paymentNote), text(s.muted, c.agreement));

  const footer = [
    h(Text, { key: "name", style: s.footer, fixed: true }, `${c.business.name}  |  ${c.title} ${c.number}`),
    h(Text, {
      key: "page",
      style: s.pageNumber,
      fixed: true,
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}`,
    }),
  ];

  return h(
    Document,
    { title: `${c.title} ${c.number}`, author: c.business.name },
    h(
      Page,
      { size: "LETTER", style: s.page },
      h(View, { style: s.band, fixed: true }),
      header,
      parties,
      period,
      table,
      schedule,
      notes,
      ...footer,
    ),
  );
}

/** Renders a quote or invoice to PDF bytes. */
export function renderQuotePdf(content: QuoteContent): Promise<Buffer> {
  return renderToBuffer(quoteDocument(content) as Parameters<typeof renderToBuffer>[0]);
}
