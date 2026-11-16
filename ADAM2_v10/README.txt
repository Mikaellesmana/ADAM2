ADAM2 v10 匯入 PostgreSQL

【一鍵匯入(Windows)】
1. 解壓縮整個資料夾(CSV、schema.sql、import.sql、import_v10.bat 要放在同一層)
2. 雙擊「import_v10.bat」
3. 輸入 Y 確認,再輸入 postgres 的密碼
4. 完成後在 pgAdmin 對 Databases 按右鍵 > Refresh,打開 adam_v10
   - 會建立新的資料庫 adam_v10,不會動到原本的資料庫
   - 如果已有 adam_v10 會先刪除重建;執行前請先在 pgAdmin 關閉對 adam_v10 的連線
   - 主機、port、使用者、資料庫名稱可在 bat 檔開頭修改

【手動匯入】
   psql -d postgres -c "CREATE DATABASE adam_v10"
   cd 到這個資料夾
   psql -d adam_v10 -f schema.sql
   psql -d adam_v10 -f import.sql

結構:6 張資料表 molecules、peptide_records、bioactivities、source_texts、publications、record_publications
編號為整數;顯示用前綴由程式產生,例如 'ADAM2_' || lpad(adam_id::text, 6, '0')。
archive/ 內為已移出的資料(不匯入)。clean_adam2.py、restructure_v10.py 為產生資料的腳本。
