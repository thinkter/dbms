# Baseline scoring

The rules baseline is deliberately explainable and dependency-free:

```bash
python -m ml.rules_baseline --data /tmp/khoji-data-test --scores-out /tmp/rules.csv
```

It covers velocity bursts, card testing, limit-hugging transfers, overnight
activity, first-seen devices, mule fan-in/fan-out, and impossible card travel.
It reads the same generated labels used by the evaluation harness and prints
precision, recall, and F1 at the selected threshold. The later Worker tool can
use these rules as parameterized SQL without changing the evidence format.
