"""Independent verification of Safety Lab Aero FTA math (v60.92).
Replicates the JS algorithms in Python and checks them against closed-form references.
"""
import math
from itertools import combinations

results = []
def check(name, computed, expected, tol=1e-9, note=""):
    ok = abs(computed - expected) <= tol * max(1.0, abs(expected))
    results.append((ok, name, computed, expected, note))

# ---------------------------------------------------------------- helpers ---
def or_p(ps):  # 1 - prod(1-p)
    q = 1.0
    for p in ps: q *= (1 - p)
    return 1 - q

def and_p(ps):
    q = 1.0
    for p in ps: q *= p
    return q

def voting_exact(ps, k):
    """Poisson-binomial tail (replicates calcBottomUp DP)."""
    n = len(ps)
    dp = [0.0] * (n + 1); dp[0] = 1.0
    for p in ps:
        for i in range(n, 0, -1):
            dp[i] = dp[i] * (1 - p) + dp[i - 1] * p
        dp[0] *= (1 - p)
    return sum(dp[k:])

def xor_exact(ps):  # exactly one
    n = len(ps)
    dp = [0.0] * (n + 1); dp[0] = 1.0
    for p in ps:
        for i in range(n, 0, -1):
            dp[i] = dp[i] * (1 - p) + dp[i - 1] * p
        dp[0] *= (1 - p)
    return dp[1]

# ------------------------------------------------- 1. mission normalization --
# _computeTopAllocatorContext: r = t_exp/t_mission, lam_op = headline/r,
# topP = 1 - exp(-lam_op * t_exp)  ==  1 - exp(-headline * t_mission)
headline, t_exp, t_mission = 1e-9, 0.5, 3.0
r = t_exp / t_mission
lam_op = headline / r
topP = -math.expm1(-lam_op * t_exp)
check("mission normalization identity: P == 1-exp(-headline*t_mission)",
      topP, -math.expm1(-headline * t_mission), 1e-12)
# operational-rate scaling sanity: lam_op should equal headline * t_mission/t_exp
check("operational rate lam_op = headline * (t_mission/t_exp)", lam_op, headline * t_mission / t_exp, 1e-12)

# ------------------------------------------------- 2. AND round trip ---------
for T in (1e-9, 1e-6, 1e-3, 0.1):
    for weights in ([1,1], [1,3], [2,5,3]):
        wsum = sum(weights)
        kids = [T ** (w / wsum) for w in weights]
        check(f"AND round-trip T={T} w={weights}", and_p(kids), T, 1e-12)

# ------------------------------------------------- 3. OR round trip ----------
for T in (1e-9, 1e-6, 1e-3, 0.1):
    for weights in ([1,1], [1,3], [2,5,3]):
        wsum = sum(weights)
        kids = [1 - (1 - T) ** (w / wsum) for w in weights]
        check(f"OR round-trip T={T} w={weights}", or_p(kids), T, 1e-12)

# ------------------------------------------------- 4. VOTING round trip ------
# allocation: p_child = (T / C(N,k))^(1/k)  (rare-event, exactly-k term)
# reconstruction: binomial tail >= k
print("VOTING k-of-N round-trip relative error (reconstructed vs target):")
for T in (1e-9, 1e-6, 1e-4, 1e-2):
    for (N, k) in ((3,2),(4,2),(4,3),(2,2)):
        binom = math.comb(N, k)
        p = (T / binom) ** (1 / k)
        rec = voting_exact([p]*N, k)
        rel = (rec - T) / T
        print(f"  T={T:.0e} {k}-of-{N}: p_child={p:.3e} reconstructed={rec:.6e} rel-err={rel:+.2%}")

# ------------------------------------------------- 5. XOR linear fallback ----
print("XOR linear-split round-trip:")
for T in (1e-6, 1e-3, 0.05):
    for n in (2, 3):
        kids = [T / n] * n
        rec = xor_exact(kids)
        print(f"  T={T:.0e} n={n}: reconstructed={rec:.6e} rel-err={(rec-T)/T:+.3%}")

# ------------------------------------------------- 6. INHIBIT/PAND/SPARE gap -
# allocation fallback: linear split T*ratio; bottom-up: product of children
print("INHIBIT/PAND/SPARE linear-split vs product reconstruction:")
for T in (1e-9, 1e-6, 1e-3):
    for n in (2, 3):
        kids = [T / n] * n
        rec = and_p(kids)
        print(f"  T={T:.0e} n={n}: allocated kids={T/n:.2e} product reconstructs to {rec:.3e} "
              f"(target {T:.0e}; under-uses budget by x{T/rec:.2e})")

# ------------------------------------------------- 7. MGL split sums ---------
for (q, b, g, d) in ((1e-4, 0.1, 0.0, 0.0), (1e-4, 0.1, 0.3, 0.0), (1e-4, 0.1, 0.3, 0.5)):
    total = q*(1-b) + q*b*(1-g) + q*b*g*(1-d) + q*b*g*d
    check(f"MGL split sums to q (b={b},g={g},d={d})", total, q, 1e-15)

# ------------------------------------------------- 8. repair-model round trip -
# allocation: lam = -ln(1-P)/t   reconstruction honors repair model:
#   continuous: lam/(lam+mu)   periodic: lam*tau/2
P, t = 1e-5, 2.0
lam = -math.log1p(-P) / t
check("repair=unmaintained round-trip", -math.expm1(-lam * t), P, 1e-12)
mu = 0.1
rec_cont = lam / (lam + mu)
print(f"repair=continuous(mu={mu}) round-trip: allocated P={P:.1e} reconstructs to {rec_cont:.3e} "
      f"(ratio {rec_cont/P:.3f}) -> MISMATCH expected unless flagged")
tau = 100.0
rec_per = min(1.0, lam * tau / 2)
print(f"repair=periodic(tau={tau}) round-trip: allocated P={P:.1e} reconstructs to {rec_per:.3e} "
      f"(ratio {rec_per/P:.3f}) -> MISMATCH expected unless flagged")

# ------------------------------------------------- 9. Markov solver replica --
def solve_markov(states, transitions):
    """Direct translation of solveMarkovModel JS."""
    n = len(states)
    idx = {s[0]: i for i, s in enumerate(states)}
    Q = [[0.0]*n for _ in range(n)]
    for (f, tt, rate) in transitions:
        i, j = idx[f], idx[tt]
        if i == j: continue
        if rate > 0: Q[i][j] += rate
    for i in range(n):
        Q[i][i] = -sum(Q[i][j] for j in range(n) if j != i)
    A = [[0.0]*n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            A[j][i] = Q[i][j]
    for j in range(n): A[n-1][j] = 1.0
    b = [0.0]*n; b[n-1] = 1.0
    for col in range(n):
        piv = col
        for rr in range(col+1, n):
            if abs(A[rr][col]) > abs(A[piv][col]): piv = rr
        if abs(A[piv][col]) < 1e-14: continue
        if piv != col:
            A[col], A[piv] = A[piv], A[col]
            b[col], b[piv] = b[piv], b[col]
        for rr in range(col+1, n):
            f = A[rr][col] / A[col][col]
            if f == 0: continue
            for c in range(col, n): A[rr][c] -= f * A[col][c]
            b[rr] -= f * b[col]
    pi = [0.0]*n
    for rr in range(n-1, -1, -1):
        if abs(A[rr][rr]) < 1e-14: continue
        s = b[rr]
        for c in range(rr+1, n): s -= A[rr][c] * pi[c]
        pi[rr] = s / A[rr][rr]
    tot = sum(pi)
    if tot > 0 and abs(tot - 1) > 1e-9:
        pi = [x / tot for x in pi]
    p_failed = sum(p for p, s in zip(pi, states) if s[1])
    return pi, p_failed

# 2-state repairable: analytic pi_failed = lam/(lam+mu)
lam2, mu2 = 1e-3, 0.5
_, pf = solve_markov([("up", False), ("down", True)],
                     [("up","down",lam2), ("down","up",mu2)])
check("Markov 2-state repairable pi_failed = lam/(lam+mu)", pf, lam2/(lam2+mu2), 1e-10)

# 3-state: up ->(2λ) degraded ->(λ) failed, repairs μ back each step
lam3, mu3 = 1e-2, 0.2
pi, pf3 = solve_markov([("up",False),("deg",False),("fail",True)],
                       [("up","deg",2*lam3),("deg","fail",lam3),
                        ("deg","up",mu3),("fail","deg",mu3)])
# analytic birth-death: pi1/pi0 = 2λ/μ, pi2/pi1 = λ/μ
r1 = 2*lam3/mu3; r2 = lam3/mu3
pi0 = 1/(1+r1+r1*r2)
check("Markov 3-state birth-death pi_failed", pf3, pi0*r1*r2, 1e-9)

# ------------------------------------------------ 10. BDD replica + rebalance -
class Leaf:
    def __init__(self, lid, p): self.lid, self.p = lid, p
def exact_or_and(pA, pB, pC):  # (A&B)|(A&C) with shared A
    return pA * or_p([pB, pC])

# mcsAwareRebalance bisection replica on (A&B)|(A&C), naive alloc then scale
target = 1e-6
# naive top-down: OR splits target: each branch gets 1-(1-T)^0.5; AND splits by sqrt
branch = 1 - (1 - target) ** 0.5
pA = pB = pC = branch ** 0.5   # each AND child gets branch^(1/2)
def exact_k(k):
    a, b_, c = min(.9999, pA*k), min(.9999, pB*k), min(.9999, pC*k)
    return exact_or_and(a, b_, c)
p1 = exact_k(1.0)
kLo, kHi, kBest = 0.0, 1.0, 1.0
if p1 > target * 1.001:
    for _ in range(60):
        kMid = (kLo + kHi) / 2
        pm = exact_k(kMid)
        kBest = kMid
        if abs(pm - target) / target < 1e-4: break
        if pm > target: kHi = kMid
        else: kLo = kMid
rec = exact_k(kBest)
check("mcsAwareRebalance replica converges to target (shared-event tree)", rec, target, 5e-4,
      note=f"k={kBest:.4f} naive-exact={p1:.3e}")

# The naive allocation on the shared tree overshoots by ~?
print(f"shared-event naive alloc reconstructs to {p1:.3e} vs target {target:.0e} "
      f"(overshoot x{p1/target:.1f}) -> rebalance k={kBest:.4f} fixes to {rec:.3e}")

# ------------------------------------------------ 11. periodic-test exact vs approx
lamp, taup = 1e-4, 500.0
approx = lamp * taup / 2
exact_avg = 1 - (1 - math.exp(-lamp * taup)) / (lamp * taup)
print(f"periodic-test approx lam*tau/2={approx:.4e} vs exact mean-unavailability={exact_avg:.4e} "
      f"(rel err {(approx-exact_avg)/exact_avg:+.2%})")

# ---------------------------------------------------------------- summary ---
print("\n=== PASS/FAIL summary ===")
fails = 0
for ok, name, c, e, note in results:
    tag = "PASS" if ok else "FAIL"
    if not ok: fails += 1
    print(f"[{tag}] {name}: computed={c:.6e} expected={e:.6e} {note}")
print(f"\n{len(results)-fails}/{len(results)} checks passed")
