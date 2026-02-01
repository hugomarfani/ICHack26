import requests
import json

BASE = "http://localhost:8001"

print("=== Suggest Attributes ===")
r = requests.post(f"{BASE}/suggest", json={
    "text": "65 year old male complaining of chest pain radiating to left arm, sweating, BP 150/95, pulse 88, SpO2 96%",
    "max_results": 8,
    "min_results": 3,
})
data = r.json()
for s in data["suggestions"]:
    print(f"  {s['id']}: {s['title']} (score: {s['final_score']:.3f})")

print(f"\n  Model: {data['meta']['model']}, Latency: {data['meta']['latency_ms']}ms")

print("\n=== Infer Pathway ===")
r = requests.post(f"{BASE}/pathways/suggest", json={
    "text": "65 year old male complaining of chest pain radiating to left arm, sweating",
    "min_score": 0.35,
})
data = r.json()
s = data.get("suggestion")
if s:
    print(f"  Pathway: {s['title']} (score: {s['score']:.3f})")
else:
    print("  No pathway matched")
