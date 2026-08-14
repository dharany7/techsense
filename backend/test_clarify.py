import urllib.request, json, time

def post(payload, label):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        "http://localhost:8000/api/symptoms/clarify",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req) as r:
        resp = json.loads(r.read())
    ms = (time.perf_counter() - t0) * 1000

    ambiguous = resp["ambiguous"]
    causes = resp["matched_causes"]
    questions = resp["questions"]

    print(f"\n=== {label} ({ms:.0f}ms) ===")
    print(f"ambiguous: {ambiguous}")
    print(f"matched_causes: {causes}")
    print(f"questions ({len(questions)}):")
    for q in questions:
        print(f"  [{q['id']}] {q['question_text']}")
        for o in q["options"]:
            print(f"    - {o}")

post({"symptom": "error code E30 on controller display"},
     "TEST 1: E30 (expect unambiguous)")

post({"symptom": "door not closing"},
     "TEST 2: door not closing (expect ambiguous + door questions)")

post({"symptom": "cabin is jerking at every floor"},
     "TEST 3: cabin jerking (expect jerking questions)")

post({"symptom": "unusual grinding noise in shaft"},
     "TEST 4: unusual noise (expect noise questions)")

post({"symptom": "elevator stuck after power cut, ARD not activating"},
     "TEST 5: power failure (expect power questions)")

post({"symptom": "something is wrong with the elevator"},
     "TEST 6: vague (expect unrecognised fallback)")

post({"symptom": "cabin stopping too high, floor gap every landing"},
     "TEST 7: overshoot (expect leveling questions)")
