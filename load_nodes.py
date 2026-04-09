from preflop_mccfr import Node
from logger import Logger
from datetime import datetime
import pickle
import os

name = input("Input path to desired nodeset: ")

now = datetime.now()
timestamp = now.strftime("%Y-%m-%d_%H-%M-%S")

os.makedirs('logs', exist_ok=True)
os.makedirs('debug_logs', exist_ok=True)

logger = Logger(output_path=f"logs/{timestamp}.txt")
debug_logger = Logger(output_path=f"debug_logs/{timestamp}.txt")

with open(name, "rb") as f:
    nodes = pickle.load(f)

os.makedirs('loaded_nodes', exist_ok=True)

for bucket, node in nodes.items():
    with open(f'loaded_nodes/{bucket[0]}', 'w') as f:
        pass

for bucket, node in nodes.items():
    with open(f'loaded_nodes/{bucket[0]}', 'a') as f:
        f.write('-----------------------------------------------------------------------------------\n')
        f.write(f"{bucket} - Loaded {node.times_visited} times\n")
        sum = 0
        for k, v in node.strategy_sum.items():
            sum += v
        for k, v in node.strategy_sum.items():
            f.write(f"{k}: {round(v/sum * 100, 1)}\n")


