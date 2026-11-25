# Tesseract traineddata (v1.21, SPEC.md §6.12)

Language models for the local OCR of uploaded meeting notices (`tesseract.js`, WASM). Loaded from this
folder only (`langPath`), never downloaded at runtime.

| File | Language | Size | SHA-256 |
|---|---|---|---|
| `ben.traineddata.gz` | Bangla | 1,373,429 bytes | `a7c1fd170b796d6b8d01b401d4bfcc54409f47b313a200e9e3756ce20d742725` |
| `eng.traineddata.gz` | English | 2,952,873 bytes | `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91` |

Source: npm packages `@tesseract.js-data/ben@1.0.0` and `@tesseract.js-data/eng@1.0.0`, folder
`4.0.0_best_int` (LSTM-only "best" models converted to integer — smaller and faster than `best`, more
accurate than `fast`). They are the official Tesseract models from
<https://github.com/tesseract-ocr/tessdata_best>, gzipped.

## Licence

The traineddata files are © Google / the Tesseract OCR contributors and licensed under the
**Apache License, Version 2.0** — <https://www.apache.org/licenses/LICENSE-2.0>
(see <https://github.com/tesseract-ocr/tessdata_best/blob/main/LICENSE>). They are redistributed here
unchanged (only gzip-compressed, as published by tesseract.js-data).

## Updating

Replace both files with the same `4.0.0_best_int` variant (the code uses OEM 1 = LSTM only), keep the
names `<lang>.traineddata.gz`, and update the table above.
