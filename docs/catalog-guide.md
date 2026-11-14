# Products and spreadsheet imports

Start `npm.cmd run dev`, open `http://127.0.0.1:5173/admin/` and sign in with the existing administrator account. Choose the city, open **Products & imports**, and select a commerce or restaurant merchant. Search and pagination happen in the database. Other listing types continue to use their existing offering forms.

## Edit products manually

The Products tab supports search, active/inactive/unavailable/archived filters, and paged results. Choose **Add product** or open an existing product. Enter its SKU, name, rupee price, optional original price, description, category, unit, dietary type, availability, active state and display order. Select an image already uploaded to this merchant's media library.

An active product becomes public when its merchant and category are publicly visible. Unavailable products remain visible with the existing unavailable label. Saving a price changes the authoritative catalog used by storefront reads and checkout validation. Existing open storefronts refresh on their next request; this is not a realtime subscription.

**Archive product** removes it from public browsing and retains the SKU, record identity and enquiry history. **Restore as inactive** requires a separate enablement after review. Imports reject archived SKUs rather than silently restoring them. There is no hard-delete control.

Use **Product categories** to create, rename, order or disable this merchant's groups. A disabled group hides its products without deleting them. Its slug or unambiguous name can be used in an import. A stale manual form fails instead of overwriting another tab's changes; reload before editing again.

## Import a file

1. Open **Import files** and choose Insert / update products or Price-only update.
2. Download the matching Excel or CSV template. Format Excel SKU cells as **Text** before entering identifiers, especially leading zeros.
3. Fill the file with literal values. Upload the `.xlsx` or UTF-8 `.csv` file. For Excel, select the intended worksheet; only that worksheet supplies product rows.
4. Choose **Validate & preview**. Fix any file/header errors. The preview classifies rows as New, Updated, Unchanged or Invalid; expand a row's details to inspect before/after values. Products remain unchanged at this point.
5. Correct every invalid row and prepare a new preview. A single invalid row blocks the entire import; valid rows are not partially applied.
6. Choose **Confirm import**, review the merchant and counts in the confirmation dialog, then choose **Confirm & apply**. All changes apply in one database transaction.
7. Review the result and download its CSV report. Prepared/applied/failed imports remain accessible through **Import history**, including after refresh.

The selected merchant supplies the merchant ID; a Merchant ID column is rejected. Each SKU is trimmed, case-sensitive and unique within that merchant. Different merchants may use the same SKU. Every duplicate in the uploaded file is invalid, even if the duplicate rows contain identical values.

Insert/update creates new SKUs and updates matching existing products. Products absent from the file remain untouched. Price-only mode requires an existing, unarchived SKU and accepts only SKU, Price and optional Original Price. It never creates products or changes names, descriptions, images, categories or availability.

## Columns and values

Headers ignore case and accept spaces, underscores or hyphens between words. Duplicate, unknown and unheaded populated columns are rejected. Use the downloaded headings for predictable results.

| Column | Accepted values |
| --- | --- |
| SKU | Required text, 1–80 characters. Numeric Excel cells are rejected to prevent loss of leading zeros. |
| Product Name | Required for insert/update, 1–180 characters. Not allowed in price-only mode. |
| Description | Plain text up to 5,000 characters. |
| Category | An existing merchant product-category slug, or an unambiguous case-insensitive name. Slug matching takes precedence. Create missing categories first. |
| Price | Required rupee amount from 0 to 999999999.99, with at most two decimal places. No currency signs, separators, exponent notation or negative amounts. |
| Original Price | Optional amount with the same format, at least Price. |
| Unit | Plain text up to 80 characters, for example `item`, `kg` or `box`. |
| Dietary Type | `vegetarian`, `non_vegetarian`, `egg` or `not_applicable`. Spaces and hyphens normalize to underscores. |
| Available | `true/false`, `yes/no` or `1/0`, case-insensitive. |
| Active | The same boolean values; controls product publication independently of availability. |
| Display Order | Integer from 0 to 1,000,000; lower values display first. |
| Image Reference | UUID of an enabled image in this merchant's media library. External URLs and another merchant's image are rejected. |

**Omitted optional columns preserve existing values. A blank cell in a supplied column is an explicit value.** Blank Description clears it; blank Category, Original Price or Image Reference clears that association/value. Blank Unit becomes `item`, Dietary Type becomes `not_applicable`, Available/Active become `true`, and Display Order becomes `0`. New products use those defaults, an empty description and no optional associations. To preserve optional fields in a bulk update, remove their columns rather than leaving cells blank.

If an existing Original Price would fall below the new Price, validation fails. Include Original Price to raise or explicitly clear it; the importer never silently removes it. For example, this minimal price file preserves all other fields:

```csv
SKU,Price
FICTIONAL-001,125.50
```

Images are uploaded separately through Media library. The import page's **Category & image references for this merchant** disclosure supplies category slugs and copyable media UUIDs. A disabled category can be associated but its products remain hidden publicly.

## Errors, retries and limits

Local errors include source row, column, code and a correction message and can be downloaded before a database preview exists. Server validation independently checks all rows and records the first error per invalid row. Reports show these errors alongside the classifications and differences. CSV record numbers count logical records, including quoted multiline records as one record; Excel errors use worksheet row positions.

Formulas are never evaluated. Excel formula cells are rejected even when they contain cached results; replace formulas using Paste Values before importing. Formula-like text beginning with `=`, `+`, `-` or `@` is also rejected in imported fields. Downloaded error/report CSV values are escaped against formula injection. Dates, spreadsheet error cells and merged cells in the selected worksheet are unsupported. Legacy `.xls`, `.xlsm`, encrypted workbooks, macros and external workbook relationships are rejected.

| Limit | Value |
| --- | --- |
| File | 5 MiB; filename at most 180 characters |
| Rows | 1,000 data rows; worksheet/CSV positions through row 1,001, including header and blank positions |
| Columns | 32 physical columns; only the documented headers are accepted |
| Normalized request | 1 MiB JSON; each product field object has a 16 KiB server budget |
| Excel workbook | 20 worksheets, 128 ZIP entries, 16 MiB total expanded bytes |
| Parsing | 15 seconds per worker operation; Cancel reading terminates the worker |
| Preview | 30 minutes; 25 rows per displayed page |
| Catalog page | 20 products by default; bounded database pagination |

Split larger catalogs into smaller files. Use a simple workbook containing the intended data; parsing rejects unsafe or ambiguous XML/ZIP structures before the cell library runs. The original spreadsheet stays in the browser worker and is not uploaded to Storage. Normalized rows, source metadata, plan and reports are stored privately for the authorized import workflow; avoid using catalog files for unrelated personal data.

The server binds a preview to its actor, merchant, mode, values and current catalog state. Relevant product/category/media/merchant edits invalidate it; expiry also requires a new preview and review. An application failure rolls back every product change and records a failed report. The dashboard locks file/mode and confirmation controls while applying; cancelling file reading cannot cancel an already submitted database transaction.

If a response is lost, retry the same confirmation or open the prepared job from history. A successfully applied job returns its saved result without applying twice. A failed or expired job needs a new preview. A request identity cannot be reused for different content. Catalog versions record revisions; they are not automatic backup/undo files. Full replacement, automatic deletion and automatic cleanup of import history are outside this phase.
