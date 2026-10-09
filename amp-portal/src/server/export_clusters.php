<?php
/**
 * export_clusters.php
 * Put this file in your ADAM PHP folder (same place as cluster_info.php)
 * Then open it in your browser: http://localhost/adam/export_clusters.php
 * It will generate cluster_list.json and cluster_detail.json
 */

set_time_limit(0);
include("LIB_mysql.php");

echo "<pre>";
echo "Starting export...\n";

// ══════════════════════════════════════════
// 1. cluster_list.json  (for /api/clusters)
//    mirrors cluster_info.php
// ══════════════════════════════════════════
$cluster_list = [];

for ($c = 1; $c <= 136; $c++) {

    // Get pdb_id, cath, scop from 136_cluster
    $row = exe_sql(DATABASE, "SELECT * FROM `136_cluster` WHERE `cluster_id` = '$c'");
    if (!$row) {
        echo "  Skipping cluster $c — no data\n";
        continue;
    }

    $pdb_id = strtoupper($row['pdb_id'] ?? '');

    // Count sequences in newsearch_all
    $cnt_row = exe_sql(DATABASE, "SELECT COUNT(DISTINCT adam_id) AS count FROM newsearch_all WHERE `cluster` = '$c'");
    $seq_count = intval($cnt_row['count'] ?? 0);

    // Get Pfam domains from newp2p
    $pfam_rows = exe_sql(DATABASE, "SELECT DISTINCT domain FROM newp2p WHERE cluster_id = '$c'");
    $pfam_list = [];
    if ($pfam_rows) {
        // exe_sql returns single row as assoc, multiple as array of assoc
        if (isset($pfam_rows['domain'])) {
            $pfam_rows = [$pfam_rows];
        }
        foreach ($pfam_rows as $pr) {
            if (!empty($pr['domain'])) $pfam_list[] = $pr['domain'];
        }
    }

    $cluster_list[] = [
        "cluster_id"  => $c,
        "pdb_id"      => $pdb_id ?: null,
        "seq_count"   => $seq_count,
        "pfam_domain" => count($pfam_list) ? implode(",", $pfam_list) : null,
        "cath_c"      => $row['cath_c']  ?? null,
        "cath_a"      => $row['cath_a']  ?? null,
        "cath_t"      => $row['cath_t']  ?? null,
        "cath_h"      => $row['cath_h']  ?? null,
        "scop_c"      => $row['scop_c']  ?? null,
        "scop_f1"     => $row['scop_f1'] ?? null,
        "scop_s"      => $row['scop_s']  ?? null,
        "scop_f2"     => $row['scop_f2'] ?? null,
    ];

    echo "  [list] Cluster $c — pdb=$pdb_id seqs=$seq_count pfam=" . count($pfam_list) . "\n";
    flush();
}

file_put_contents("cluster_list.json", json_encode($cluster_list, JSON_PRETTY_PRINT));
echo "\nSaved cluster_list.json (" . count($cluster_list) . " clusters)\n\n";


// ══════════════════════════════════════════
// 2. cluster_detail.json  (for /api/clusters/:id)
//    mirrors cluster_detail.php
// ══════════════════════════════════════════
$cluster_detail = [];

for ($c = 1; $c <= 136; $c++) {

    // Get all PDB rows from 264_cluster for this cluster
    $c_array = exe_sql(DATABASE, "SELECT * FROM `264_cluster` WHERE `cluster_id` = '$c'");

    if (!$c_array) {
        echo "  [detail] Cluster $c — no entries\n";
        $cluster_detail[$c] = [
            "cluster_id" => $c,
            "seq_count"  => 0,
            "pfam_count" => 0,
            "cath_c"     => null,
            "scop_c"     => null,
            "entries"    => [],
        ];
        continue;
    }

    // Wrap single row into array
    if (isset($c_array['pdb_id'])) {
        $c_array = [$c_array];
    }

    // Total sequences for this cluster
    $cnt_row   = exe_sql(DATABASE, "SELECT COUNT(DISTINCT adam_id) AS count FROM newsearch_all WHERE `cluster` = '$c'");
    $seq_count = intval($cnt_row['count'] ?? 0);

    $entries   = [];
    $all_pfams = [];

    foreach ($c_array as $row) {
        $c_pdb  = strtoupper($row['pdb_id'] ?? '');
        $pdb4   = substr($c_pdb, 0, 4);
        $chain  = substr($c_pdb, 4, 1);

        // Count sequences linked to this PDB
        $plink  = exe_sql(DATABASE, "SELECT COUNT(id) as cnt FROM `newsearch_all` WHERE `pdb_id` LIKE '%$c_pdb%'");
        $plink_cnt = intval($plink['cnt'] ?? 0);

        // Get Pfam domains for this PDB
        $domain_rows = exe_sql(DATABASE, "SELECT DISTINCT domain FROM newp2p WHERE `pdb_id` = '$c_pdb'");
        $domains = [];
        if ($domain_rows) {
            if (isset($domain_rows['domain'])) $domain_rows = [$domain_rows];
            foreach ($domain_rows as $dr) {
                if (!empty($dr['domain'])) {
                    $domains[]   = $dr['domain'];
                    $all_pfams[] = $dr['domain'];
                }
            }
        }

        // Get CATH for this cluster
        $cath = exe_sql(DATABASE, "SELECT cath_c, cath_a, cath_t, cath_h FROM `264_cluster` WHERE `cluster_id` = '$c' AND `pdb_id` = '" . strtolower($row['pdb_id']) . "'");
        if (!$cath) $cath = $row; // fallback to the row itself

        // Get SCOP for this cluster
        $scop = exe_sql(DATABASE, "SELECT scop_c, scop_f1, scop_s, scop_f2 FROM `264_cluster` WHERE `cluster_id` = '$c' AND `pdb_id` = '" . strtolower($row['pdb_id']) . "'");
        if (!$scop) $scop = $row;

        $entries[] = [
            "pdb_id"       => $c_pdb,
            "chain"        => $chain ?: null,
            "seq_count"    => $plink_cnt,
            "pfam_domains" => count($domains) ? implode(",", $domains) : null,
            "cath_c"       => $cath['cath_c']  ?? $row['cath_c']  ?? null,
            "cath_a"       => $cath['cath_a']  ?? $row['cath_a']  ?? null,
            "cath_t"       => $cath['cath_t']  ?? $row['cath_t']  ?? null,
            "cath_h"       => $cath['cath_h']  ?? $row['cath_h']  ?? null,
            "scop_c"       => $scop['scop_c']  ?? $row['scop_c']  ?? null,
            "scop_f1"      => $scop['scop_f1'] ?? $row['scop_f1'] ?? null,
            "scop_s"       => $scop['scop_s']  ?? $row['scop_s']  ?? null,
            "scop_f2"      => $scop['scop_f2'] ?? $row['scop_f2'] ?? null,
        ];
    }

    $unique_pfams = array_unique($all_pfams);
    $first        = $entries[0] ?? [];

    $cluster_detail[$c] = [
        "cluster_id" => $c,
        "seq_count"  => $seq_count,
        "pfam_count" => count($unique_pfams),
        "cath_c"     => $first['cath_c'] ?? null,
        "scop_c"     => $first['scop_c'] ?? null,
        "entries"    => $entries,
    ];

    echo "  [detail] Cluster $c — " . count($entries) . " PDB entries, $seq_count seqs\n";
    flush();
}

file_put_contents("cluster_detail.json", json_encode($cluster_detail, JSON_PRETTY_PRINT));
echo "\nSaved cluster_detail.json (" . count($cluster_detail) . " clusters)\n";

echo "\n✅ DONE! Copy cluster_list.json and cluster_detail.json to your Node server folder.\n";
echo "</pre>";
?>