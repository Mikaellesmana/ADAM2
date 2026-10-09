"""
run_training_chain.py
─────────────────────
Runs the remaining retraining jobs on the new dataset, one after another.

  1. Waits for the in-flight 12,000-sample ESMC FLM run to finish.
  2. ESM-2 FLM on all 47,409 sequences      (train_flm.py)
  3. ESMC FLM on all 47,409 sequences       (train_esmc_flm.py, ESMC_FLM_MAX_SAMPLES=0)

Sequential on purpose: each job already uses every core, so running two at once
would just make both slower. Every job checkpoints, so if this runner is killed
it can simply be started again — finished folds are skipped.

Progress: training_chain.log, plus each job's own log.
"""

import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
CHAIN_LOG = os.path.join(HERE, "training_chain.log")


def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(CHAIN_LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def ckpt_done(path):
    try:
        with open(os.path.join(HERE, path)) as f:
            return json.load(f).get("final_done", False)
    except (OSError, ValueError):
        return False


def pid_alive(pid):
    out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}"],
                         capture_output=True, text=True).stdout
    return str(pid) in out


def run(name, script, logname, extra_env=None):
    env = dict(os.environ, **(extra_env or {}))
    log(f"START {name}")
    t0 = time.time()
    with open(os.path.join(HERE, logname), "a", encoding="utf-8") as out:
        rc = subprocess.run([PY, "-u", script], cwd=HERE, env=env,
                            stdout=out, stderr=subprocess.STDOUT).returncode
    log(f"END   {name} exit={rc} after {(time.time() - t0) / 3600:.1f}h")
    return rc


def main():
    wait_pid = int(sys.argv[1]) if len(sys.argv) > 1 else None
    if wait_pid:
        log(f"Waiting for 12k ESMC FLM run (PID {wait_pid}) to finish...")
        while pid_alive(wait_pid) and not ckpt_done("esmc_flm_checkpoint.json"):
            time.sleep(60)
        while pid_alive(wait_pid):          # let it finish writing the model
            time.sleep(10)
        log(f"12k run finished (final_done={ckpt_done('esmc_flm_checkpoint.json')})")

    if not ckpt_done("flm_kfold_checkpoint.json"):
        run("ESM-2 FLM, full new dataset", "train_flm.py", "train_flm_newdata.log")
    else:
        log("ESM-2 FLM already complete, skipping")

    if not ckpt_done("esmc_flm_checkpoint_full.json"):
        run("ESMC FLM, full new dataset", "train_esmc_flm.py", "train_esmc_flm_full.log",
            {"ESMC_FLM_MAX_SAMPLES": "0", "ESMC_FLM_TAG": "_full"})
    else:
        log("ESMC FLM (full) already complete, skipping")

    log("CHAIN COMPLETE")


if __name__ == "__main__":
    main()
