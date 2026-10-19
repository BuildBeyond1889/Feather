"""Feather's math tutor: lessons, a random problem generator for every topic (elementary to advanced),
answers checked as math (SymPy), worked solutions, a placement quiz, and mastery that unlocks topics."""
import math as M
import random
import re
from fractions import Fraction as F

_sp = None


def sp():
    global _sp
    if _sp is None:
        import sympy
        _sp = sympy
    return _sp


def available():
    try:
        sp()
        return True
    except ImportError:
        return False


R = random.Random()


def nz(a, b):
    v = 0
    while v == 0:
        v = R.randint(a, b)
    return v


def lx(e):
    return sp().latex(e)


def frac_tex(f):
    f = F(f)
    if f.denominator == 1:
        return str(f.numerator)
    s = "-" if f < 0 else ""
    return f"{s}\\frac{{{abs(f.numerator)}}}{{{f.denominator}}}"


def frac_str(f):
    f = F(f)
    return str(f.numerator) if f.denominator == 1 else f"{f.numerator}/{f.denominator}"


def P(q, ans, kind="expr", steps=(), hint="", **kw):
    return {"q": q, "ans": ans, "kind": kind, "steps": list(steps), "hint": hint, **kw}


# =====================================================================================
# FOUNDATIONS
# =====================================================================================
def g_add():
    op = R.choice("+-*/")
    if op == "+":
        a, b = R.randint(100, 9999), R.randint(100, 9999)
        return P(f"$${a} + {b}$$", str(a + b), "num", [f"Line up the place values and add column by column, carrying when a column passes 9: ${a}+{b}={a + b}$."], "Start from the ones column.")
    if op == "-":
        a, b = R.randint(500, 9999), R.randint(100, 499)
        return P(f"$${a} - {b}$$", str(a - b), "num", [f"Subtract column by column, borrowing from the next place when needed: ${a}-{b}={a - b}$."], "Borrow from the tens when the top digit is smaller.")
    if op == "*":
        a, b = R.randint(12, 99), R.randint(3, 29)
        return P(f"$${a} \\times {b}$$", str(a * b), "num", [f"Split it: ${a}\\times{b} = {a}\\times{b // 10 * 10} + {a}\\times{b % 10} = {a * (b // 10 * 10)} + {a * (b % 10)} = {a * b}$."], "Break the smaller number into tens and ones.")
    b, k = R.randint(3, 19), R.randint(12, 99)
    return P(f"$${b * k} \\div {b}$$", str(k), "num", [f"Ask: {b} times what is {b * k}? ${b}\\times{k}={b * k}$, so the answer is ${k}$."], "Think of it as a missing-factor multiplication.")


def g_order():
    a, b, c, d = R.randint(2, 12), R.randint(2, 9), R.randint(2, 9), R.randint(1, 20)
    if R.random() < 0.5:
        v = a + b * c - d
        return P(f"$${a} + {b} \\times {c} - {d}$$", str(v), "num", [f"Multiplication first: ${b}\\times{c}={b * c}$.", f"Then left to right: ${a}+{b * c}-{d}={v}$."], "Multiply and divide before you add and subtract.")
    k = R.randint(2, 6)
    c = k * R.randint(1, 3)
    s = a + b
    v = s * c // k
    return P(f"$$({a} + {b}) \\times {c} \\div {k}$$", str(v), "num", [f"Brackets first: ${a}+{b}={s}$.", f"Then left to right: ${s}\\times{c}={s * c}$, and ${s * c}\\div{k}={v}$."], "Brackets, then powers, then × and ÷ left to right, then + and −.")


def g_neg():
    a, b = R.randint(2, 30), R.randint(2, 30)
    t = R.randint(0, 3)
    if t == 0:
        return P(f"$$(-{a}) + {b}$$", str(b - a), "num", [f"Adding a positive to a negative: think of a number line. Start at $-{a}$, move {b} right: ${b - a}$."], "Signs differ: subtract the sizes and keep the sign of the bigger one.")
    if t == 1:
        return P(f"$${a} - (-{b})$$", str(a + b), "num", ["Subtracting a negative is the same as adding: $" + f"{a}-(-{b})={a}+{b}={a + b}$."], "Two negatives in a row become a plus.")
    if t == 2:
        a, b = R.randint(2, 12), R.randint(2, 12)
        return P(f"$$(-{a}) \\times (-{b})$$", str(a * b), "num", [f"Negative times negative is positive: ${a}\\times{b}={a * b}$."], "Count the negative signs: an even number gives a positive.")
    b, k = R.randint(2, 12), R.randint(2, 12)
    return P(f"$$(-{b * k}) \\div {b}$$", str(-k), "num", [f"Different signs give a negative: ${b * k}\\div{b}={k}$, so $-{k}$."], "One negative sign means a negative answer.")


def g_frac():
    a, b, c, d = R.randint(1, 9), R.randint(2, 12), R.randint(1, 9), R.randint(2, 12)
    x, y = F(a, b), F(c, d)
    op = R.choice("+-*/")
    v = {"+": x + y, "-": x - y, "*": x * y, "/": x / y}[op]
    L_ = b * d // M.gcd(b, d)
    st = {"+": [f"Common denominator ${L_}$: rewrite both fractions over it and add the tops."],
          "-": [f"Common denominator ${L_}$: rewrite both fractions over it and subtract the tops."],
          "*": [f"Multiply tops and bottoms: $\\frac{{{a}\\cdot{c}}}{{{b}\\cdot{d}}}=\\frac{{{a * c}}}{{{b * d}}}$."],
          "/": [f"Dividing is multiplying by the flip: $\\frac{{{a}}}{{{b}}}\\times\\frac{{{d}}}{{{c}}}$."]}[op] + [f"Simplify: ${frac_tex(v)}$."]
    sym = {"+": "+", "-": "-", "*": "\\times", "/": "\\div"}[op]
    return P(f"$$\\frac{{{a}}}{{{b}}} {sym} \\frac{{{c}}}{{{d}}}$$", frac_str(v), "num", st, "For + and −, you need a common denominator first.")


def g_dec():
    t = R.randint(0, 2)
    if t == 0:
        p, n = R.choice(range(5, 100, 5)), R.choice(range(20, 501, 20))
        v = F(p * n, 100)
        return P(f"What is ${p}\\%$ of ${n}$?", frac_str(v), "num", [f"Percent means per hundred: ${p}\\% = {p / 100}$.", f"${p / 100}\\times{n}={float(v):g}$."], "Turn the percent into a decimal and multiply.")
    if t == 1:
        a, b = R.randint(11, 99) / 10, R.randint(2, 9) / 10
        v = round(a * b, 3)
        return P(f"$${a} \\times {b}$$", f"{v:g}", "num", [f"Ignore the points: ${int(a * 10)}\\times{int(b * 10)}={int(a * 10) * int(b * 10)}$.", f"There are 2 decimal places in total, so ${v:g}$."], "Count the decimal places in both numbers.")
    a, b = R.choice([(1, 4), (3, 4), (1, 5), (2, 5), (3, 8), (7, 20), (1, 8), (9, 25), (13, 50)])
    v = F(a, b) * 100
    return P(f"Write $\\frac{{{a}}}{{{b}}}$ as a percent (just the number).", frac_str(v), "num", [f"$\\frac{{{a}}}{{{b}}} = {a / b:g}$, and times 100 is ${float(v):g}\\%$."], "Divide, then multiply by 100.")


def g_ratio():
    a, b, k = R.randint(2, 9), R.randint(2, 9), R.randint(2, 9)
    c = b * k
    v = a * k
    return P(f"Solve for $x$: $$\\frac{{{a}}}{{{b}}} = \\frac{{x}}{{{c}}}$$", str(v), "num", [f"Cross-multiply: ${b}x = {a}\\times{c} = {a * c}$.", f"Divide by {b}: $x={v}$."], "Cross-multiply, then divide.")


def g_exp():
    t = R.randint(0, 2)
    if t == 0:
        a, n = R.randint(2, 6), R.randint(2, 4)
        return P(f"$${a}^{{{n}}}$$", str(a ** n), "num", [f"${a}^{{{n}}}$ means {a} multiplied by itself {n} times: $" + "\\times".join([str(a)] * n) + f"={a ** n}$."], "The exponent counts how many times the base is multiplied.")
    if t == 1:
        r = R.randint(2, 20)
        return P(f"$$\\sqrt{{{r * r}}}$$", str(r), "num", [f"${r}\\times{r}={r * r}$, so $\\sqrt{{{r * r}}}={r}$."], "Which number times itself gives this?")
    a, n = R.randint(2, 5), R.randint(1, 3)
    return P(f"$${a}^{{-{n}}}$$", f"1/{a ** n}", "num", [f"A negative exponent means one over: ${a}^{{-{n}}}=\\frac{{1}}{{{a}^{{{n}}}}}=\\frac{{1}}{{{a ** n}}}$."], "Negative exponent → flip it into a fraction.")


def g_expr():
    x = sp().Symbol("x")
    if R.random() < 0.5:
        a, b, c, k = nz(-5, 5), nz(-9, 9), R.randint(-9, 9), R.randint(-4, 4)
        e = a * x ** 2 + b * x + c
        v = e.subs(x, k)
        return P(f"Evaluate ${lx(e)}$ when $x = {k}$.", str(v), "num", [f"Substitute: ${a}({k})^2 + {b}({k}) + {c}$.", f"$= {a * k * k} + {b * k} + {c} = {v}$."], "Put the number in brackets wherever you see x.")
    a, b, c, d = nz(-9, 9), nz(-9, 9), nz(-9, 9), nz(-9, 9)
    e = sp().expand(a * x + b + c * x - d)
    return P(f"Simplify: $${a}x {'+' if b >= 0 else '-'} {abs(b)} {'+' if c >= 0 else '-'} {abs(c)}x - ({d})$$", str(e), "expr", [f"Group the x terms: ${a}x + ({c})x = {a + c}x$.", f"Group the numbers: ${b} - ({d}) = {b - d}$.", f"Answer: ${lx(e)}$."], "Combine like terms: x's with x's, numbers with numbers.")


def g_lin1():
    x0, a, b = R.randint(-12, 12), nz(-9, 9), R.randint(-20, 20)
    c = a * x0 + b
    return P(f"Solve for $x$: $${a}x {'+' if b >= 0 else '-'} {abs(b)} = {c}$$", str(x0), "num",
             [f"Undo the {'+' if b >= 0 else '-'}{abs(b)}: ${a}x = {c} - ({b}) = {c - b}$.", f"Divide by {a}: $x = {x0}$."], "Undo operations in reverse order: first the + or −, then the ×.")


def g_lin2():
    x0 = R.randint(-10, 10)
    a, c = nz(-9, 9), nz(-9, 9)
    while c == a:
        c = nz(-9, 9)
    b = R.randint(-20, 20)
    d = a * x0 + b - c * x0
    return P(f"Solve for $x$: $${a}x {'+' if b >= 0 else '-'} {abs(b)} = {c}x {'+' if d >= 0 else '-'} {abs(d)}$$", str(x0), "num",
             [f"Get x on one side: ${a}x - ({c})x = {d} - ({b})$.", f"${a - c}x = {d - b}$.", f"$x = {x0}$."], "Move all x terms to one side, numbers to the other.")


def g_ineq():
    x0, a, b = R.randint(-8, 8), nz(-6, 6), R.randint(-15, 15)
    sym = R.choice(["<", ">", "\\le", "\\ge"])
    c = a * x0 + b
    flip = {"<": ">", ">": "<", "\\le": "\\ge", "\\ge": "\\le"}
    res = flip[sym] if a < 0 else sym
    txt = {"<": "<", ">": ">", "\\le": "<=", "\\ge": ">="}
    return P(f"Solve: $${a}x {'+' if b >= 0 else '-'} {abs(b)} {sym} {c}$$ (answer like x < 3)", f"x {txt[res]} {x0}", "ineq",
             [f"Subtract {b}: ${a}x {sym} {c - b}$.", f"Divide by {a}" + (" (negative, so flip the sign)" if a < 0 else "") + f": $x {res} {x0}$."],
             "Dividing or multiplying by a negative flips the inequality.")


def g_slope():
    x1, y1 = R.randint(-8, 8), R.randint(-8, 8)
    x2 = x1 + nz(-6, 6)
    y2 = R.randint(-8, 8)
    m = F(y2 - y1, x2 - x1)
    if R.random() < 0.5:
        return P(f"Find the slope of the line through $({x1}, {y1})$ and $({x2}, {y2})$.", frac_str(m), "num",
                 [f"$m = \\frac{{y_2-y_1}}{{x_2-x_1}} = \\frac{{{y2}-({y1})}}{{{x2}-({x1})}} = \\frac{{{y2 - y1}}}{{{x2 - x1}}} = {frac_tex(m)}$."], "Rise over run: change in y over change in x.")
    b = y1 - m * x1
    x = sp().Symbol("x")
    e = sp().Rational(m.numerator, m.denominator) * x + sp().Rational(b.numerator, b.denominator)
    return P(f"Write the equation of the line through $({x1}, {y1})$ and $({x2}, {y2})$ as $y = mx + b$.", str(e), "expr",
             [f"Slope: $m = {frac_tex(m)}$.", f"Use a point: ${y1} = {frac_tex(m)}\\cdot({x1}) + b$, so $b = {frac_tex(b)}$.", f"$y = {lx(e)}$."], "Find m first, then plug one point in to get b.")


def g_sys():
    x0, y0 = R.randint(-6, 6), R.randint(-6, 6)
    while True:
        a1, b1, a2, b2 = nz(-5, 5), nz(-5, 5), nz(-5, 5), nz(-5, 5)
        if a1 * b2 - a2 * b1 != 0:
            break
    c1, c2 = a1 * x0 + b1 * y0, a2 * x0 + b2 * y0

    def eq(a, b, c):
        return f"{a}x {'+' if b >= 0 else '-'} {abs(b)}y = {c}"
    return P(f"Solve the system: $$\\begin{{cases}} {eq(a1, b1, c1)} \\\\ {eq(a2, b2, c2)} \\end{{cases}}$$ (answer like (2, -3))", f"({x0}, {y0})", "point",
             ["Eliminate one variable: multiply the equations so the x (or y) coefficients match, then subtract.", f"You get one variable, then substitute back: $x={x0},\\ y={y0}$."], "Make one variable cancel, solve for the other, then substitute.")


def g_poly():
    x = sp().Symbol("x")
    a, b, c, d = nz(-5, 5), nz(-9, 9), nz(-5, 5), nz(-9, 9)
    e = sp().expand((a * x + b) * (c * x + d))
    return P(f"Expand: $$({lx(a * x + b)})({lx(c * x + d)})$$", str(e), "expanded",
             [f"FOIL: first ${a * c}x^2$, outer ${a * d}x$, inner ${b * c}x$, last ${b * d}$.", f"Combine: ${lx(e)}$."], "Multiply every term in the first bracket by every term in the second.")


def g_fact():
    x = sp().Symbol("x")
    p, q = nz(-9, 9), nz(-9, 9)
    a = 1 if R.random() < 0.6 else R.randint(2, 3)
    e = sp().expand((a * x + p) * (x + q))
    return P(f"Factor: $${lx(e)}$$", str(sp().factor(e)), "factored",
             ([f"Find two numbers that multiply to ${p * q}$ and add to ${p + q}$: ${p}$ and ${q}$."] if a == 1 else
              [f"Multiply $a\\cdot c = {a * p * q}$; find two numbers that multiply to that and add to ${p + a * q}$, then group."]) + [f"${lx(sp().factor(e))}$."],
             "Look for two numbers that multiply to the constant and add to the middle coefficient.")


def g_quad():
    x = sp().Symbol("x")
    if R.random() < 0.55:
        r1, r2 = R.randint(-9, 9), R.randint(-9, 9)
        a = R.choice([1, 1, 2])
        e = sp().expand(a * (x - r1) * (x - r2))
        sols = sorted({r1, r2})
        return P(f"Solve: $${lx(e)} = 0$$ (list all solutions, separated by commas)", ", ".join(map(str, sols)), "set",
                 [f"Factor: ${lx(sp().factor(e))} = 0$.", "A product is zero when a factor is zero: " + ", ".join(f"$x={s}$" for s in sols) + "."], "Factor it, or use the quadratic formula.")
    while True:
        a, b, c = R.randint(1, 3), R.randint(-9, 9), R.randint(-9, 9)
        D = b * b - 4 * a * c
        if D > 0 and int(M.isqrt(D)) ** 2 != D:
            break
    e = a * x ** 2 + b * x + c
    sols = sp().solve(e, x)
    return P(f"Solve: $${lx(e)} = 0$$ (exact answers, e.g. 1 + sqrt(2), 1 - sqrt(2))", ", ".join(str(s) for s in sols), "set",
             [f"Quadratic formula: $x=\\frac{{-b\\pm\\sqrt{{b^2-4ac}}}}{{2a}}$ with $a={a}, b={b}, c={c}$.", f"Discriminant: $({b})^2-4({a})({c})={D}$.",
              "$x = " + ",\\ ".join(lx(s) for s in sols) + "$."], "Use the quadratic formula; simplify the square root.")


def g_rad():
    k, m = R.randint(2, 9), R.choice([2, 3, 5, 6, 7, 10, 11])
    n = k * k * m
    return P(f"Simplify: $$\\sqrt{{{n}}}$$", f"{k}*sqrt({m})", "radical", [f"Find the biggest square factor: ${n} = {k * k}\\times{m}$.", f"$\\sqrt{{{n}}} = \\sqrt{{{k * k}}}\\sqrt{{{m}}} = {k}\\sqrt{{{m}}}$."], "Pull out the largest perfect square.", forbid=f"sqrt({n})")


def g_expo():
    x = sp().Symbol("x")
    a, b, c, d = R.randint(2, 5), R.randint(2, 4), R.randint(1, 6), R.randint(1, 9)
    k = a * b + c - d
    return P(f"Simplify: $$\\frac{{(x^{{{a}}})^{{{b}}} \\cdot x^{{{c}}}}}{{x^{{{d}}}}}$$", str(x ** k), "expr",
             [f"Power of a power multiplies: $(x^{{{a}}})^{{{b}}} = x^{{{a * b}}}$.", f"Multiplying adds exponents: $x^{{{a * b}+{c}}} = x^{{{a * b + c}}}$.", f"Dividing subtracts: $x^{{{a * b + c}-{d}}} = x^{{{k}}}$."],
             "Multiply exponents for powers of powers, add when multiplying, subtract when dividing.")


def g_func():
    a, b, c, k = nz(-5, 5), R.randint(-9, 9), R.randint(-9, 9), R.randint(-4, 4)
    g = k * k + c
    v = a * g + b
    return P(f"$f(x) = {a}x {'+' if b >= 0 else '-'} {abs(b)}$ and $g(x) = x^2 {'+' if c >= 0 else '-'} {abs(c)}$. Find $f(g({k}))$.", str(v), "num",
             [f"Inside first: $g({k}) = {k}^2 + ({c}) = {g}$.", f"Then $f({g}) = {a}({g}) + ({b}) = {v}$."], "Work from the inside out.")


def g_log():
    t = R.randint(0, 2)
    b = R.choice([2, 3, 5, 10])
    k = R.randint(1, 5 if b < 5 else 3)
    if t == 0:
        return P(f"$$\\log_{{{b}}} {b ** k}$$", str(k), "num", [f"Ask: {b} to what power is {b ** k}? ${b}^{{{k}}} = {b ** k}$, so the answer is ${k}$."], "A log asks: what power?")
    if t == 1:
        return P(f"Solve for $x$: $${b}^x = {b ** k}$$", str(k), "num", [f"Write ${b ** k}$ as a power of {b}: ${b}^{{{k}}}$.", f"Same base, so $x = {k}$."], "Rewrite both sides with the same base.")
    j = R.randint(1, 3)
    return P(f"$$\\log_2 {2 ** k} + \\log_2 {2 ** j}$$", str(k + j), "num", [f"Each log separately: ${k} + {j} = {k + j}$ (or combine: $\\log_2 {2 ** (k + j)}$)."], "log(a) + log(b) = log(ab).")


# ---------------- geometry & trig ----------------
def g_area():
    t = R.randint(0, 2)
    if t == 0:
        a, b = R.randint(3, 25), R.randint(3, 25)
        return P(f"A rectangle is ${a}$ by ${b}$. What is its area?", str(a * b), "num", [f"Area = length × width = ${a}\\times{b} = {a * b}$."], "Length times width.")
    if t == 1:
        b, h = R.randint(2, 20) * 2, R.randint(3, 20)
        return P(f"A triangle has base ${b}$ and height ${h}$. What is its area?", str(b * h // 2), "num", [f"Area = $\\frac12 \\cdot b \\cdot h = \\frac12\\cdot{b}\\cdot{h} = {b * h // 2}$."], "Half of base times height.")
    r = R.randint(2, 12)
    return P(f"A circle has radius ${r}$. What is its area? (exact, in terms of pi)", f"{r * r}*pi", "expr", [f"Area = $\\pi r^2 = \\pi\\cdot{r}^2 = {r * r}\\pi$."], "πr².")


def g_pyth():
    a0, b0, c0 = R.choice([(3, 4, 5), (5, 12, 13), (8, 15, 17), (7, 24, 25), (20, 21, 29)])
    k = R.randint(1, 4)
    a, b, c = a0 * k, b0 * k, c0 * k
    if R.random() < 0.5:
        return P(f"A right triangle has legs ${a}$ and ${b}$. How long is the hypotenuse?", str(c), "num", [f"$c^2 = {a}^2 + {b}^2 = {a * a} + {b * b} = {c * c}$.", f"$c = \\sqrt{{{c * c}}} = {c}$."], "a² + b² = c².")
    return P(f"A right triangle has hypotenuse ${c}$ and one leg ${a}$. How long is the other leg?", str(b), "num", [f"$b^2 = {c}^2 - {a}^2 = {c * c} - {a * a} = {b * b}$.", f"$b = {b}$."], "Rearrange: b² = c² − a².")


def g_angle():
    t = R.randint(0, 2)
    if t == 0:
        a, b = R.randint(20, 100), R.randint(20, 60)
        return P(f"Two angles of a triangle are ${a}^\\circ$ and ${b}^\\circ$. What is the third angle (in degrees)?", str(180 - a - b), "num", [f"Angles in a triangle add to $180^\\circ$: $180 - {a} - {b} = {180 - a - b}$."], "Triangle angles add up to 180°.")
    if t == 1:
        a = R.randint(15, 165)
        return P(f"Angle $A$ is ${a}^\\circ$. What is its supplement (in degrees)?", str(180 - a), "num", [f"Supplementary angles add to $180^\\circ$: $180 - {a} = {180 - a}$."], "Supplement: adds to 180°. Complement: adds to 90°.")
    n = R.randint(5, 12)
    return P(f"What is the sum of the interior angles of a polygon with ${n}$ sides (in degrees)?", str((n - 2) * 180), "num", [f"Sum $= (n-2)\\times180 = ({n}-2)\\times180 = {(n - 2) * 180}$."], "Split it into triangles from one corner: n − 2 triangles.")


def g_vol():
    t = R.randint(0, 2)
    if t == 0:
        a, b, c = R.randint(2, 12), R.randint(2, 12), R.randint(2, 12)
        return P(f"A box is ${a}\\times{b}\\times{c}$. What is its volume?", str(a * b * c), "num", [f"$V = lwh = {a}\\cdot{b}\\cdot{c} = {a * b * c}$."], "Multiply the three dimensions.")
    if t == 1:
        r, h = R.randint(2, 9), R.randint(2, 15)
        return P(f"A cylinder has radius ${r}$ and height ${h}$. Volume? (exact, in terms of pi)", f"{r * r * h}*pi", "expr", [f"$V = \\pi r^2 h = \\pi\\cdot{r * r}\\cdot{h} = {r * r * h}\\pi$."], "Area of the circle times the height.")
    r = R.choice([3, 6, 9])
    v = F(4, 3) * r ** 3
    return P(f"A sphere has radius ${r}$. Volume? (exact, in terms of pi)", f"{frac_str(v)}*pi", "expr", [f"$V = \\frac43\\pi r^3 = \\frac43\\pi\\cdot{r ** 3} = {frac_tex(v)}\\pi$."], "(4/3)πr³.")


def g_trig():
    ang, h = R.randint(15, 75), R.randint(5, 40)
    fn = R.choice(["sin", "cos"])
    v = h * (M.sin(M.radians(ang)) if fn == "sin" else M.cos(M.radians(ang)))
    side = "opposite" if fn == "sin" else "adjacent"
    return P(f"A right triangle has hypotenuse ${h}$ and an angle of ${ang}^\\circ$. How long is the side {side} that angle? (2 decimals)", f"{v:.2f}", "approx",
             [f"$\\{fn}\\theta = \\frac{{\\text{{{side}}}}}{{\\text{{hypotenuse}}}}$, so {side} $= {h}\\{fn}({ang}^\\circ)$.", f"$= {h}\\times{M.sin(M.radians(ang)) if fn == 'sin' else M.cos(M.radians(ang)):.4f} \\approx {v:.2f}$."],
             "SOH CAH TOA. Make sure your calculator is in degrees.")


def g_unit():
    s = sp()
    ang = R.choice([0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330])
    fn = R.choice(["sin", "cos"] + (["tan"] if ang % 180 != 90 else []))
    v = getattr(s, fn)(s.pi * ang / 180)
    v = s.nsimplify(s.simplify(v))
    rad = s.pi * ang / 180
    return P(f"Exact value: $$\\{fn}\\left({lx(rad)}\\right)$$", str(v), "expr",
             [f"${lx(rad)}$ radians is ${ang}^\\circ$.", f"On the unit circle, $\\{fn}({ang}^\\circ) = {lx(v)}$."], "Use the reference angle (30°, 45° or 60°) and the quadrant's sign.")


def g_rad_deg():
    s = sp()
    ang = R.choice(range(15, 360, 15))
    if R.random() < 0.5:
        r = s.pi * ang / 180
        return P(f"Convert ${ang}^\\circ$ to radians (exact, in terms of pi).", str(r), "expr", [f"Multiply by $\\frac{{\\pi}}{{180}}$: ${ang}\\cdot\\frac{{\\pi}}{{180}} = {lx(r)}$."], "Degrees × π/180.")
    r = s.pi * ang / 180
    return P(f"Convert ${lx(r)}$ radians to degrees.", str(ang), "num", [f"Multiply by $\\frac{{180}}{{\\pi}}$: ${lx(r)}\\cdot\\frac{{180}}{{\\pi}} = {ang}^\\circ$."], "Radians × 180/π.")


def g_complex():
    s = sp()
    a, b, c, d = R.randint(-6, 6), nz(-6, 6), R.randint(-6, 6), nz(-6, 6)
    z1, z2 = a + b * s.I, c + d * s.I
    if R.random() < 0.5:
        v = s.expand(z1 * z2)
        return P(f"Multiply: $$({lx(z1)})({lx(z2)})$$ (answer like 3 + 4i)", str(v), "expr", [f"FOIL, using $i^2 = -1$: ${a * c} + {a * d}i + {b * c}i + {b * d}i^2$.", f"$= {lx(v)}$."], "Expand like brackets; replace i² with −1.")
    v = s.expand(z1 + z2)
    return P(f"Add: $$({lx(z1)}) + ({lx(z2)})$$", str(v), "expr", [f"Real parts: ${a}+{c}={a + c}$; imaginary parts: ${b}+{d}={b + d}$.", f"$= {lx(v)}$."], "Add real to real, imaginary to imaginary.")


def g_seq():
    n = R.randint(5, 20)
    if R.random() < 0.5:
        a, d = R.randint(-10, 20), nz(-6, 9)
        v = a + (n - 1) * d
        return P(f"An arithmetic sequence starts ${a}, {a + d}, {a + 2 * d}, \\ldots$ What is term number ${n}$?", str(v), "num", [f"$a_n = a_1 + (n-1)d = {a} + ({n}-1)({d}) = {v}$."], "Find the common difference d first.")
    a, r = R.randint(1, 5), R.choice([2, 3, -2])
    n = R.randint(4, 8)
    v = a * r ** (n - 1)
    return P(f"A geometric sequence starts ${a}, {a * r}, {a * r * r}, \\ldots$ What is term number ${n}$?", str(v), "num", [f"$a_n = a_1 r^{{n-1}} = {a}\\cdot({r})^{{{n - 1}}} = {v}$."], "Find the common ratio r first.")


# =====================================================================================
# CALCULUS
# =====================================================================================
def g_lim():
    s = sp()
    x = s.Symbol("x")
    t = R.randint(0, 2)
    if t == 0:
        a = nz(-6, 6)
        e = (x ** 2 - a * a) / (x - a)
        return P(f"$$\\lim_{{x\\to {a}}} \\frac{{x^2 - {a * a}}}{{x {'-' if a > 0 else '+'} {abs(a)}}}$$", str(2 * a), "num",
                 [f"Plugging in gives $\\frac00$, so factor: $\\frac{{(x-{a})(x+{a})}}{{x-{a}}} = x + {a}$ (for $x\\ne{a}$).".replace("+-", "-").replace("--", "+"), f"Now plug in: ${a} + {a} = {2 * a}$."],
                 "0/0 means factor and cancel.")
    if t == 1:
        a, b, c, k = nz(-4, 4), R.randint(-6, 6), R.randint(-6, 6), R.randint(-3, 3)
        e = a * x ** 2 + b * x + c
        v = e.subs(x, k)
        return P(f"$$\\lim_{{x\\to {k}}} \\left({lx(e)}\\right)$$", str(v), "num", ["Polynomials are continuous, so substitute directly.", f"$= {v}$."], "No problem at that point? Just plug it in.")
    a, b = nz(-7, 7), nz(1, 7)
    c, d = R.randint(-9, 9), R.randint(-9, 9)
    num, den = a * x ** 2 + c * x + 1, b * x ** 2 + d
    return P(f"$$\\lim_{{x\\to\\infty}} \\frac{{{lx(num)}}}{{{lx(den)}}}$$", frac_str(F(a, b)), "num",
             ["Same highest power on top and bottom: the limit is the ratio of the leading coefficients.", f"$\\frac{{{a}}}{{{b}}} = {frac_tex(F(a, b))}$."], "Compare the highest powers.")


def g_deriv():
    s = sp()
    x = s.Symbol("x")
    e = sum(nz(-9, 9) * x ** n for n in R.sample(range(0, 6), 3))
    d = s.diff(e, x)
    return P(f"Find $\\frac{{d}}{{dx}}$ of $${lx(e)}$$", str(d), "expr", ["Power rule: $\\frac{d}{dx}x^n = nx^{n-1}$, term by term; constants vanish.", f"$= {lx(d)}$."], "Bring the power down, subtract one from it.")


def g_rules():
    s = sp()
    x = s.Symbol("x")
    a, n, k = nz(-5, 5), R.randint(2, 5), nz(-4, 4)
    t = R.randint(0, 3)
    if t == 0:
        u, v = x ** n, s.sin(x)
        e = u * v
        steps = ["Product rule: $(uv)' = u'v + uv'$.", f"$u = {lx(u)},\\ u' = {lx(s.diff(u, x))}$; $v = {lx(v)},\\ v' = {lx(s.diff(v, x))}$.",
                 f"$= {lx(s.diff(u, x))}\\,{lx(v)} + {lx(u)}\\,{lx(s.diff(v, x))}$."]
    elif t == 1:
        u, v = x ** 2 + k, x + a
        e = u / v
        steps = ["Quotient rule: $\\left(\\frac uv\\right)' = \\frac{u'v - uv'}{v^2}$.", f"$u = {lx(u)},\\ u' = {lx(s.diff(u, x))}$; $v = {lx(v)},\\ v' = 1$.",
                 f"$= \\frac{{({lx(s.diff(u, x))})({lx(v)}) - ({lx(u)})(1)}}{{({lx(v)})^2}} = {lx(s.factor(s.simplify(s.diff(e, x))))}$."]
    elif t == 2:
        inner = a * x + k
        e = inner ** n
        steps = ["Chain rule: derivative of the outside (keep the inside) times the derivative of the inside.",
                 f"Outside: $u^{{{n}}} \\to {n}u^{{{n - 1}}}$. Inside: $u = {lx(inner)},\\ u' = {a}$.", f"$= {n}({lx(inner)})^{{{n - 1}}}\\cdot {a} = {lx(s.factor(s.diff(e, x)))}$."]
    else:
        inner = k * x ** 2
        e = s.exp(inner)
        steps = ["Chain rule with $e^u$: $(e^u)' = e^u\\,u'$.", f"Inside: $u = {lx(inner)},\\ u' = {lx(s.diff(inner, x))}$.", f"$= {lx(s.diff(e, x))}$."]
    d = s.diff(e, x)
    return P(f"Differentiate: $${lx(e)}$$", str(d), "expr", steps, "Pick the rule: product, quotient, or chain.")


def g_tangent():
    s = sp()
    x = s.Symbol("x")
    a, b, c, k = nz(-3, 3), R.randint(-5, 5), R.randint(-5, 5), R.randint(-3, 3)
    e = a * x ** 3 + b * x ** 2 + c * x
    m = s.diff(e, x).subs(x, k)
    y0 = e.subs(x, k)
    line = s.expand(m * (x - k) + y0)
    return P(f"Find the tangent line to $y = {lx(e)}$ at $x = {k}$. (answer as y = mx + b)", str(line), "expr",
             [f"Slope: $y' = {lx(s.diff(e, x))}$, so $m = {m}$ at $x={k}$.", f"Point: $y({k}) = {y0}$.", f"$y - ({y0}) = {m}(x - ({k}))$, so $y = {lx(line)}$."],
             "Slope from the derivative, point from the function.")


def g_crit():
    s = sp()
    x = s.Symbol("x")
    r1, r2 = R.randint(-6, 6), R.randint(-6, 6)
    while r2 == r1:
        r2 = R.randint(-6, 6)
    fp = 3 * (x - r1) * (x - r2)
    f = s.integrate(s.expand(fp), x) + R.randint(-9, 9)
    return P(f"Find the critical points (x-values) of $$f(x) = {lx(s.expand(f))}$$ (comma-separated)", f"{min(r1, r2)}, {max(r1, r2)}", "set",
             [f"$f'(x) = {lx(s.expand(fp))} = {lx(s.factor(fp))}$.", f"Set $f'(x) = 0$: $x = {r1}$ or $x = {r2}$."], "Set the derivative to zero and solve.")


def g_int():
    s = sp()
    x = s.Symbol("x")
    e = sum(nz(-6, 6) * (n + 1) * x ** n for n in R.sample(range(0, 5), 3))
    i = s.integrate(e, x)
    return P(f"Find the antiderivative: $$\\int {lx(e)}\\,dx$$ (+C optional)", str(i), "antideriv", [f"Reverse power rule: $\\int x^n dx = \\frac{{x^{{n+1}}}}{{n+1}}$.", f"$= {lx(i)} + C$."], "Add one to the power, divide by the new power.", var="x", integrand=str(e))


def g_defint():
    s = sp()
    x = s.Symbol("x")
    a, b = R.randint(-3, 2), R.randint(3, 6)
    e = nz(-4, 4) * x ** 2 + nz(-6, 6) * x + R.randint(-5, 5)
    i = s.integrate(e, x)
    v = s.integrate(e, (x, a, b))
    return P(f"$$\\int_{{{a}}}^{{{b}}} \\left({lx(e)}\\right)dx$$", str(v), "num",
             [f"Antiderivative: $F(x) = {lx(i)}$.", f"$F({b}) - F({a}) = {i.subs(x, b)} - ({i.subs(x, a)}) = {lx(v)}$."], "Antiderivative, then top minus bottom.")


def g_usub():
    s = sp()
    x = s.Symbol("x")
    k, n = R.randint(1, 9), R.randint(2, 5)
    e = x * (x ** 2 + k) ** n
    i = s.integrate(e, x)
    return P(f"$$\\int {lx(e)}\\,dx$$ (+C optional)", str(i), "antideriv",
             [f"Let $u = x^2 + {k}$, so $du = 2x\\,dx$ and $x\\,dx = \\frac{{du}}{{2}}$.", f"$\\int \\frac12 u^{{{n}}}du = \\frac{{u^{{{n + 1}}}}}{{{2 * (n + 1)}}}$.", f"$= \\frac{{(x^2+{k})^{{{n + 1}}}}}{{{2 * (n + 1)}}} + C$."],
             "Look for a function and its derivative.", var="x", integrand=str(e))


def g_parts():
    s = sp()
    x = s.Symbol("x")
    k = nz(-3, 3)
    e = R.choice([x * s.exp(k * x), x * s.cos(k * x), x * s.sin(k * x)])
    i = s.integrate(e, x)
    return P(f"$$\\int {lx(e)}\\,dx$$ (+C optional)", str(i), "antideriv",
             ["Integration by parts: $\\int u\\,dv = uv - \\int v\\,du$ with $u = x$.", f"$= {lx(i)} + C$."], "Let u = x (it gets simpler when you differentiate it).", var="x", integrand=str(e))


def g_series():
    a = R.randint(1, 9)
    p = R.randint(1, 4)
    q = R.randint(p + 1, 6)
    r = F(p, q) * R.choice([1, -1])
    v = F(a) / (1 - r)
    return P(f"$$\\sum_{{n=0}}^{{\\infty}} {a}\\left({frac_tex(r)}\\right)^n$$", frac_str(v), "num",
             [f"Geometric series with $a={a}$, $r={frac_tex(r)}$, and $|r|<1$ so it converges.", f"Sum $= \\frac{{a}}{{1-r}} = \\frac{{{a}}}{{1-({frac_tex(r)})}} = {frac_tex(v)}$."], "a / (1 − r) when |r| < 1.")


def g_partial():
    s = sp()
    x, y = s.symbols("x y")
    e = nz(-5, 5) * x ** R.randint(1, 3) * y ** R.randint(1, 3) + nz(-5, 5) * x ** 2 + nz(-5, 5) * y
    v = R.choice([x, y])
    d = s.diff(e, v)
    return P(f"Find $\\frac{{\\partial f}}{{\\partial {v}}}$ for $$f(x,y) = {lx(e)}$$", str(d), "expr",
             [f"Treat the other variable as a constant and differentiate with respect to ${v}$.", f"$= {lx(d)}$."], "Everything that isn't the variable acts like a number.")


def g_de():
    s = sp()
    t = s.Symbol("t")
    k = R.choice([-3, -2, -1, 1, 2, 3])
    A = R.randint(1, 9)
    e = A * s.exp(k * t)
    return P(f"Solve $\\frac{{dy}}{{dt}} = {k}y$ with $y(0) = {A}$. (answer as y = ...)", str(e), "expr",
             ["Separate: $\\frac{dy}{y} = " + f"{k}\\,dt$, integrate: $\\ln|y| = {k}t + C$.", f"So $y = Ce^{{{k}t}}$, and $y(0) = {A}$ gives $C={A}$: $y = {lx(e)}$."],
             "Rate proportional to amount → exponential.")


# =====================================================================================
# HIGHER MATH
# =====================================================================================
def mat_tex(m):
    return "\\begin{pmatrix}" + "\\\\".join("&".join(str(v) for v in row) for row in m) + "\\end{pmatrix}"


def g_mat():
    A = [[R.randint(-5, 5) for _ in range(2)] for _ in range(2)]
    B = [[R.randint(-5, 5) for _ in range(2)] for _ in range(2)]
    C = [[sum(A[i][k] * B[k][j] for k in range(2)) for j in range(2)] for i in range(2)]
    return P(f"$${mat_tex(A)}{mat_tex(B)}$$ (answer like [[1, 2], [3, 4]])", str(C), "matrix",
             ["Each entry = row of the first · column of the second.", f"Top-left: ${A[0][0]}\\cdot{B[0][0]} + {A[0][1]}\\cdot{B[1][0]} = {C[0][0]}$, and so on.", f"$= {mat_tex(C)}$."], "Row times column.")


def g_det():
    s = sp()
    n = R.choice([2, 2, 3])
    A = [[R.randint(-5, 5) for _ in range(n)] for _ in range(n)]
    d = s.Matrix(A).det()
    st = [f"$ad - bc = ({A[0][0]})({A[1][1]}) - ({A[0][1]})({A[1][0]}) = {d}$."] if n == 2 else ["Expand along the first row: each entry times the determinant of its 2×2 minor, with alternating signs.", f"$= {d}$."]
    return P(f"$$\\det{mat_tex(A)}$$", str(d), "num", st, "2×2: ad − bc. 3×3: expand along a row.")


def g_eig():
    s = sp()
    r1, r2 = R.randint(-5, 5), R.randint(-5, 5)
    k = R.randint(-3, 3)
    Pm = s.Matrix([[1, k], [0, 1]]) if R.random() < 0.5 else s.Matrix([[1, 0], [k, 1]])
    A = Pm * s.Matrix([[r1, R.randint(-3, 3)], [0, r2]]) * Pm.inv()
    tr, det = A.trace(), A.det()
    return P(f"Find the eigenvalues of $${mat_tex(A.tolist())}$$ (comma-separated)", ", ".join(str(v) for v in sorted({r1, r2})), "set",
             [f"Solve $\\det(A - \\lambda I) = 0$: $\\lambda^2 - ({tr})\\lambda + ({det}) = 0$.", f"$\\lambda = {r1},\\ {r2}$."], "λ² − (trace)λ + det = 0.")


def g_gcd():
    g = R.randint(2, 15)
    a, b = g * R.randint(2, 12), g * R.randint(2, 12)
    if R.random() < 0.5:
        G = M.gcd(a, b)
        return P(f"Find $\\gcd({a}, {b})$.", str(G), "num", [f"Euclid: keep replacing the bigger number by the remainder until it's 0.", f"$\\gcd = {G}$."], "Euclidean algorithm, or list prime factors.")
    L_ = a * b // M.gcd(a, b)
    return P(f"Find $\\operatorname{{lcm}}({a}, {b})$.", str(L_), "num", [f"$\\operatorname{{lcm}} = \\frac{{ab}}{{\\gcd(a,b)}} = \\frac{{{a}\\cdot{b}}}{{{M.gcd(a, b)}}} = {L_}$."], "lcm = a·b / gcd.")


def g_mod():
    n = R.randint(3, 13)
    t = R.randint(0, 2)
    if t == 0:
        a = R.randint(20, 500)
        return P(f"$${a} \\bmod {n}$$", str(a % n), "num", [f"${a} = {n}\\cdot{a // n} + {a % n}$, so the remainder is ${a % n}$."], "The remainder after dividing.")
    if t == 1:
        a, b = R.randint(10, 99), R.randint(10, 99)
        return P(f"$$({a} \\cdot {b}) \\bmod {n}$$", str(a * b % n), "num", [f"Reduce first: ${a}\\equiv{a % n}$, ${b}\\equiv{b % n}$.", f"${a % n}\\cdot{b % n} = {(a % n) * (b % n)} \\equiv {a * b % n} \\pmod{{{n}}}$."], "Reduce each factor first.")
    a, k = R.randint(2, 9), R.randint(5, 30)
    return P(f"$${a}^{{{k}}} \\bmod {n}$$", str(pow(a, k, n)), "num", ["Square-and-multiply, reducing mod n at every step (powers repeat in a cycle).", f"$= {pow(a, k, n)}$."], "Look for the repeating cycle of powers.")


def g_comb():
    n = R.randint(5, 12)
    k = R.randint(2, min(5, n - 1))
    if R.random() < 0.5:
        v = M.comb(n, k)
        return P(f"How many ways can you choose ${k}$ people from ${n}$ (order doesn't matter)?", str(v), "num", [f"$\\binom{{{n}}}{{{k}}} = \\frac{{{n}!}}{{{k}!\\,{n - k}!}} = {v}$."], "Order doesn't matter → combinations.")
    v = M.perm(n, k)
    prod = "\\cdot".join(str(n - i) for i in range(k))
    return P(f"How many ways can the first ${k}$ places be filled by ${n}$ runners (order matters)?", str(v), "num", [f"Order matters: ${prod} = {v}$."], "Order matters → permutations.")


def g_sets():
    a, b = R.randint(15, 40), R.randint(15, 40)
    both = R.randint(3, min(a, b) - 2)
    return P(f"In a class, ${a}$ students play guitar, ${b}$ play piano, and ${both}$ play both. How many play at least one?", str(a + b - both), "num",
             [f"$|A\\cup B| = |A| + |B| - |A\\cap B| = {a} + {b} - {both} = {a + b - both}$."], "Don't count the overlap twice.")


def g_bin():
    n = R.randint(5, 255)
    if R.random() < 0.5:
        return P(f"Write ${n}$ in binary.", bin(n)[2:], "str", [f"Divide by 2 repeatedly and read the remainders bottom to top: ${bin(n)[2:]}$."], "Powers of 2: 128, 64, 32, 16, 8, 4, 2, 1.")
    return P(f"Convert binary ${bin(n)[2:]}$ to decimal.", str(n), "num", ["Add the powers of 2 where there's a 1: " + " + ".join(str(2 ** i) for i, c in enumerate(reversed(bin(n)[2:])) if c == "1") + f" $= {n}$."], "Rightmost digit is 1s, then 2s, 4s, 8s…")


def g_sum():
    n = R.randint(10, 100)
    if R.random() < 0.6:
        v = n * (n + 1) // 2
        return P(f"$$\\sum_{{k=1}}^{{{n}}} k$$", str(v), "num", [f"$\\frac{{n(n+1)}}{{2}} = \\frac{{{n}\\cdot{n + 1}}}{{2}} = {v}$."], "Pair the first and last terms (Gauss).")
    n = R.randint(5, 20)
    v = n * (n + 1) * (2 * n + 1) // 6
    return P(f"$$\\sum_{{k=1}}^{{{n}}} k^2$$", str(v), "num", [f"$\\frac{{n(n+1)(2n+1)}}{{6}} = {v}$."], "n(n+1)(2n+1)/6.")


# =====================================================================================
# STATISTICS & PROBABILITY
# =====================================================================================
def g_mean():
    xs = [R.randint(1, 30) for _ in range(R.choice([5, 6, 7]))]
    t = R.randint(0, 2)
    s = sorted(xs)
    if t == 0:
        v = F(sum(xs), len(xs))
        return P(f"Find the mean of: ${', '.join(map(str, xs))}$", frac_str(v), "num", [f"Sum $= {sum(xs)}$, count $= {len(xs)}$, mean $= {frac_tex(v)}$" + (f" $\\approx {float(v):.2f}$" if v.denominator != 1 else "") + "."], "Add them up, divide by how many.")
    if t == 1:
        n = len(s)
        v = F(s[n // 2]) if n % 2 else F(s[n // 2 - 1] + s[n // 2], 2)
        return P(f"Find the median of: ${', '.join(map(str, xs))}$", frac_str(v), "num", [f"Sort: ${', '.join(map(str, s))}$.", f"Middle value{'' if n % 2 else 's averaged'}: ${frac_tex(v)}$."], "Sort first, then take the middle.")
    return P(f"Find the range of: ${', '.join(map(str, xs))}$", str(max(xs) - min(xs)), "num", [f"Max − min $= {max(xs)} - {min(xs)} = {max(xs) - min(xs)}$."], "Biggest minus smallest.")


def g_prob():
    if R.random() < 0.5:
        k = R.randint(2, 12)
        ways = sum(1 for a in range(1, 7) for b in range(1, 7) if a + b == k)
        v = F(ways, 36)
        return P(f"Two fair dice are rolled. What is the probability the sum is ${k}$?", frac_str(v), "num", [f"There are $36$ outcomes; {ways} of them sum to {k}.", f"$P = \\frac{{{ways}}}{{36}} = {frac_tex(v)}$."], "Count favourable outcomes out of 36.")
    r, b, g = R.randint(2, 9), R.randint(2, 9), R.randint(2, 9)
    v = F(r, r + b + g)
    return P(f"A bag has ${r}$ red, ${b}$ blue and ${g}$ green marbles. What is the probability of drawing a red one?", frac_str(v), "num", [f"$P = \\frac{{{r}}}{{{r + b + g}}} = {frac_tex(v)}$."], "Favourable over total.")


def g_indep():
    r, b = R.randint(2, 8), R.randint(2, 8)
    n = r + b
    if R.random() < 0.5:
        v = F(r, n) * F(r, n)
        return P(f"A bag has ${r}$ red and ${b}$ blue marbles. You draw one, put it back, and draw again. P(both red)?", frac_str(v), "num", [f"Independent: $\\frac{{{r}}}{{{n}}}\\cdot\\frac{{{r}}}{{{n}}} = {frac_tex(v)}$."], "With replacement: multiply the same probability twice.")
    v = F(r, n) * F(r - 1, n - 1)
    return P(f"A bag has ${r}$ red and ${b}$ blue marbles. You draw two without putting the first back. P(both red)?", frac_str(v), "num", [f"$\\frac{{{r}}}{{{n}}}\\cdot\\frac{{{r - 1}}}{{{n - 1}}} = {frac_tex(v)}$."], "Without replacement: the second draw has one fewer of each.")


def g_binom():
    n = R.randint(3, 6)
    k = R.randint(0, n)
    p = R.choice([F(1, 2), F(1, 6), F(1, 3)])
    v = M.comb(n, k) * p ** k * (1 - p) ** (n - k)
    what = {F(1, 2): "a fair coin lands heads", F(1, 6): "a die shows a six", F(1, 3): "a spinner (1 in 3) lands on red"}[p]
    return P(f"You try ${n}$ times. What is the probability that {what} exactly ${k}$ times?", frac_str(v), "num",
             [f"Binomial: $\\binom{{{n}}}{{{k}}}p^{{{k}}}(1-p)^{{{n - k}}}$ with $p={frac_tex(p)}$.", f"$= {M.comb(n, k)}\\cdot{frac_tex(p ** k)}\\cdot{frac_tex((1 - p) ** (n - k))} = {frac_tex(v)}$."], "nCk · p^k · (1−p)^(n−k).")


def g_ev():
    win, cost = R.randint(5, 50), R.randint(1, 5)
    p = R.choice([F(1, 4), F(1, 5), F(1, 10), F(1, 6)])
    v = p * win - cost
    return P(f"A game costs ${cost}$ dollars. You win ${win}$ dollars with probability ${frac_tex(p)}$, otherwise nothing. Expected profit per game?", frac_str(v), "num",
             [f"$E = {frac_tex(p)}\\cdot{win} - {cost} = {frac_tex(p * win)} - {cost} = {frac_tex(v)}$."], "Sum of (value × probability), minus the cost.")


def g_sd():
    xs = [R.randint(1, 20) for _ in range(5)]
    mu = sum(xs) / 5
    v = M.sqrt(sum((x - mu) ** 2 for x in xs) / 5)
    return P(f"Find the population standard deviation of: ${', '.join(map(str, xs))}$ (2 decimals)", f"{v:.2f}", "approx",
             [f"Mean $= {mu:g}$.", "Average of squared distances from the mean (variance): $" + f"{v * v:.3f}$.", f"Square root: ${v:.2f}$."], "Mean → squared differences → average → square root.")


def g_z():
    mu, sd = R.randint(50, 100), R.randint(5, 15)
    x = mu + sd * R.choice([-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 2.5])
    v = (x - mu) / sd
    return P(f"Scores have mean ${mu}$ and standard deviation ${sd}$. What is the z-score of ${x:g}$?", f"{v:g}", "num", [f"$z = \\frac{{x-\\mu}}{{\\sigma}} = \\frac{{{x:g}-{mu}}}{{{sd}}} = {v:g}$."], "How many SDs from the mean?")


# =====================================================================================
# THE CURRICULUM: (id, name, track, level, prerequisites, generator, lesson)
# =====================================================================================
T = [
    ("f_add", "Whole-number arithmetic", "Foundations", 1, [], g_add, "Add and subtract column by column (ones, tens, hundreds), carrying or borrowing between columns. Multiplying a big number is easier split up: 34 × 12 = 34 × 10 + 34 × 2. Division asks the reverse question: what times the divisor gives the number?"),
    ("f_order", "Order of operations", "Foundations", 1, ["f_add"], g_order, "Brackets first, then powers, then multiplication and division (left to right), then addition and subtraction (left to right). 2 + 3 × 4 is 14, not 20, because × goes before +."),
    ("f_neg", "Negative numbers", "Foundations", 2, ["f_add"], g_neg, "On a number line, adding moves right and subtracting moves left. Subtracting a negative is adding: 5 − (−3) = 8. For × and ÷: same signs give a positive, different signs give a negative."),
    ("f_frac", "Fractions", "Foundations", 2, ["f_order"], g_frac, "To add or subtract fractions you need a common denominator: ½ + ⅓ = 3/6 + 2/6 = 5/6. To multiply, multiply tops and bottoms. To divide, flip the second fraction and multiply. Always simplify by dividing top and bottom by their greatest common factor."),
    ("f_dec", "Decimals & percents", "Foundations", 2, ["f_frac"], g_dec, "Percent means 'out of 100': 35% = 0.35. To find p% of n, multiply n by p/100. Multiplying decimals: multiply as whole numbers, then put back as many decimal places as the two numbers had together."),
    ("f_ratio", "Ratios & proportions", "Foundations", 3, ["f_frac"], g_ratio, "A proportion says two ratios are equal: a/b = c/d. Cross-multiplying gives ad = bc, which lets you solve for a missing value. Proportions show up in scaling, recipes, maps and unit rates."),
    ("f_exp", "Exponents & roots", "Foundations", 3, ["f_order"], g_exp, "aⁿ means a multiplied by itself n times. A square root undoes squaring: √49 = 7. A negative exponent means 'one over': 2⁻³ = 1/2³ = 1/8, and anything to the power 0 is 1."),
    ("f_expr", "Expressions", "Foundations", 3, ["f_neg", "f_exp"], g_expr, "An expression uses letters for numbers. To evaluate, substitute the value in brackets: if x = −2, then 3x² = 3(−2)² = 12. To simplify, combine like terms: 3x + 5 + 2x = 5x + 5."),
    ("f_lin1", "Linear equations (1–2 steps)", "Foundations", 4, ["f_expr"], g_lin1, "Solving means getting x alone while keeping both sides balanced: whatever you do to one side, do to the other. Undo operations in reverse: 3x + 5 = 20 → subtract 5 → 3x = 15 → divide by 3 → x = 5."),
    ("f_lin2", "Linear equations (x on both sides)", "Foundations", 5, ["f_lin1"], g_lin2, "When x appears on both sides, move all the x terms to one side and all the numbers to the other, then divide. 5x − 2 = 2x + 7 → 3x = 9 → x = 3. Check by substituting back."),
    ("f_ineq", "Linear inequalities", "Foundations", 5, ["f_lin1"], g_ineq, "Solve inequalities like equations, with one twist: multiplying or dividing by a negative number flips the sign. −2x < 6 → x > −3. The answer is a range of numbers, not one number."),
    ("f_slope", "Slope & lines", "Foundations", 6, ["f_lin2", "f_frac"], g_slope, "Slope m = rise/run = (y₂ − y₁)/(x₂ − x₁). A line is y = mx + b, where b is where it crosses the y-axis. To find the line through two points: get m, then plug one point in to find b."),
    ("f_sys", "Systems of equations", "Foundations", 7, ["f_slope"], g_sys, "Two equations, two unknowns: the answer is where the two lines cross. Elimination: scale the equations so one variable has matching coefficients, subtract to remove it, solve, then substitute back."),
    ("f_poly", "Multiplying polynomials", "Foundations", 6, ["f_expr"], g_poly, "Multiply every term in the first bracket by every term in the second, then combine like terms. For two binomials this is FOIL: First, Outer, Inner, Last. (x + 2)(x + 3) = x² + 5x + 6."),
    ("f_fact", "Factoring", "Foundations", 7, ["f_poly"], g_fact, "Factoring undoes expanding. For x² + bx + c, find two numbers that multiply to c and add to b: x² + 5x + 6 = (x + 2)(x + 3). With a leading coefficient, use the ac method: multiply a·c, split the middle term, group."),
    ("f_quad", "Quadratic equations", "Foundations", 8, ["f_fact", "f_exp"], g_quad, "Set it equal to zero and factor: a product is zero only when a factor is zero. When it won't factor nicely, use the quadratic formula x = (−b ± √(b² − 4ac)) / 2a. The discriminant b² − 4ac tells you how many real solutions."),
    ("f_rad", "Simplifying radicals", "Foundations", 6, ["f_exp"], g_rad, "Pull perfect squares out of a square root: √72 = √(36 · 2) = 6√2. Look for the largest square factor (4, 9, 16, 25, 36, 49, …)."),
    ("f_expo", "Exponent rules", "Foundations", 6, ["f_exp", "f_expr"], g_expo, "Multiplying same bases adds exponents: x²·x³ = x⁵. Dividing subtracts: x⁵/x² = x³. A power of a power multiplies: (x²)³ = x⁶."),
    ("f_func", "Functions", "Foundations", 7, ["f_expr"], g_func, "A function is a rule: f(x) = 2x + 1 turns 3 into 7. Composition f(g(x)) means do g first, then put the result into f. Work from the inside out."),
    ("f_log", "Logarithms", "Foundations", 9, ["f_expo", "f_func"], g_log, "A logarithm asks 'what power?': log₂ 8 = 3 because 2³ = 8. Rules: log(ab) = log a + log b, log(aⁿ) = n log a. To solve bˣ = N, rewrite N as a power of b, or take logs of both sides."),
    ("g_area", "Area & perimeter", "Geometry & trig", 3, ["f_order"], g_area, "Rectangle: length × width. Triangle: ½ × base × height. Circle: πr² (circumference 2πr). Perimeter is the distance around; area is the space inside, in square units."),
    ("g_pyth", "Pythagorean theorem", "Geometry & trig", 5, ["f_exp"], g_pyth, "In a right triangle, a² + b² = c², where c is the hypotenuse (the side opposite the right angle). To find a leg: b² = c² − a². Common triples: 3-4-5, 5-12-13, 8-15-17."),
    ("g_angle", "Angles & polygons", "Geometry & trig", 3, ["f_add"], g_angle, "Triangle angles add to 180°. Supplementary angles add to 180°, complementary to 90°. A polygon with n sides has interior angles summing to (n − 2) × 180°."),
    ("g_vol", "Volume", "Geometry & trig", 4, ["g_area"], g_vol, "Box: l × w × h. Cylinder: πr²h (circle area times height). Sphere: (4/3)πr³. Cone: (1/3)πr²h. Volume is in cubic units."),
    ("t_trig", "Right-triangle trig", "Geometry & trig", 8, ["g_pyth"], g_trig, "SOH CAH TOA: sin θ = opposite/hypotenuse, cos θ = adjacent/hypotenuse, tan θ = opposite/adjacent. Rearranged: opposite = hypotenuse × sin θ."),
    ("t_rad", "Radians", "Geometry & trig", 8, ["t_trig"], g_rad_deg, "A full circle is 360° = 2π radians, so 180° = π. Degrees → radians: × π/180. Radians → degrees: × 180/π. 90° = π/2, 60° = π/3, 45° = π/4, 30° = π/6."),
    ("t_unit", "The unit circle", "Geometry & trig", 9, ["t_rad", "f_rad"], g_unit, "On a circle of radius 1, a point at angle θ is (cos θ, sin θ). Memorise 30°, 45°, 60°: sin values ½, √2/2, √3/2 (cos goes the other way). Other quadrants use the same values with signs: All Students Take Calculus (which are positive in quadrants I to IV)."),
    ("p_complex", "Complex numbers", "Foundations", 9, ["f_quad"], g_complex, "i is defined by i² = −1. A complex number is a + bi. Add by combining real parts and imaginary parts; multiply like brackets, replacing i² with −1."),
    ("p_seq", "Sequences", "Foundations", 6, ["f_lin1", "f_exp"], g_seq, "Arithmetic: add the same d each time, aₙ = a₁ + (n − 1)d. Geometric: multiply by the same r each time, aₙ = a₁·rⁿ⁻¹."),
    ("c_lim", "Limits", "Calculus", 10, ["f_fact", "f_func"], g_lim, "A limit is the value f(x) approaches as x approaches a. If plugging in works, that's it. If you get 0/0, factor and cancel, then plug in. As x → ∞, rational functions are dominated by their highest powers."),
    ("c_deriv", "Derivatives: power rule", "Calculus", 11, ["c_lim"], g_deriv, "The derivative is the slope of the tangent line, the instantaneous rate of change. Power rule: d/dx xⁿ = nxⁿ⁻¹. Constants become 0, and you differentiate term by term."),
    ("c_rules", "Product, quotient & chain rules", "Calculus", 12, ["c_deriv", "t_unit"], g_rules, "Product: (uv)' = u'v + uv'. Quotient: (u/v)' = (u'v − uv')/v². Chain: (f(g(x)))' = f'(g(x))·g'(x). Also: (sin x)' = cos x, (cos x)' = −sin x, (eˣ)' = eˣ."),
    ("c_tangent", "Tangent lines", "Calculus", 12, ["c_deriv", "f_slope"], g_tangent, "The tangent line at x = a has slope f'(a) and passes through (a, f(a)). Point-slope form: y − f(a) = f'(a)(x − a), then tidy into y = mx + b."),
    ("c_crit", "Critical points", "Calculus", 13, ["c_deriv", "f_quad"], g_crit, "Critical points are where f'(x) = 0 (or doesn't exist). They're candidates for maxima and minima. The sign of f' around them tells you which is which."),
    ("c_int", "Antiderivatives", "Calculus", 13, ["c_deriv"], g_int, "Integration reverses differentiation: ∫xⁿ dx = xⁿ⁺¹/(n + 1) + C (n ≠ −1). Integrate term by term. The + C is there because constants vanish when you differentiate."),
    ("c_defint", "Definite integrals", "Calculus", 14, ["c_int"], g_defint, "∫ₐᵇ f(x) dx = F(b) − F(a), where F is any antiderivative: the net area under the curve from a to b."),
    ("c_usub", "u-substitution", "Calculus", 15, ["c_int", "c_rules"], g_usub, "When the integrand contains a function and its derivative, let u be the inside function. Then du = u'(x) dx, and the integral becomes simpler in u. Reverse of the chain rule."),
    ("c_parts", "Integration by parts", "Calculus", 16, ["c_usub"], g_parts, "∫u dv = uv − ∫v du. Pick u to be what gets simpler when differentiated (usually the polynomial), and dv what you can integrate. Reverse of the product rule."),
    ("c_series", "Infinite series", "Calculus", 15, ["p_seq", "c_lim"], g_series, "A geometric series a + ar + ar² + … converges when |r| < 1, and its sum is a/(1 − r). If |r| ≥ 1 it diverges."),
    ("c_partial", "Partial derivatives", "Calculus", 16, ["c_rules"], g_partial, "For f(x, y), ∂f/∂x is the derivative with respect to x while treating y as a constant (and vice versa). It's the slope of the surface in one direction."),
    ("c_de", "Differential equations", "Calculus", 17, ["c_usub", "f_log"], g_de, "A differential equation relates a function to its derivatives. dy/dt = ky (growth or decay) has solution y = y₀eᵏᵗ. Separable equations: get all the y's on one side, t's on the other, integrate both."),
    ("h_gcd", "GCD & LCM", "Higher math", 4, ["f_add"], g_gcd, "The GCD is the largest number dividing both; the LCM is the smallest number both divide. Euclid's algorithm: gcd(a, b) = gcd(b, a mod b) until the remainder is 0. lcm(a, b) = ab / gcd(a, b)."),
    ("h_mod", "Modular arithmetic", "Higher math", 8, ["h_gcd"], g_mod, "a mod n is the remainder when a is divided by n. You can reduce at every step: (a·b) mod n = ((a mod n)(b mod n)) mod n. Powers mod n cycle, which makes huge powers easy."),
    ("h_bin", "Number bases", "Higher math", 5, ["f_exp"], g_bin, "Binary uses powers of 2: 1011₂ = 8 + 0 + 2 + 1 = 11. To convert to binary, subtract the biggest power of 2 that fits, or divide by 2 repeatedly and read the remainders upward."),
    ("h_sets", "Sets & counting", "Higher math", 5, ["f_add"], g_sets, "Inclusion–exclusion: |A ∪ B| = |A| + |B| − |A ∩ B|. Drawing a Venn diagram helps: fill in the overlap first."),
    ("h_comb", "Permutations & combinations", "Higher math", 8, ["f_exp"], g_comb, "Order matters (arrangements): nPk = n!/(n − k)!. Order doesn't matter (choices): nCk = n!/(k!(n − k)!). Choosing 2 from 5: 10 ways; ranking 2 from 5: 20 ways."),
    ("h_sum", "Sums & induction", "Higher math", 9, ["p_seq"], g_sum, "Classic formulas: 1 + 2 + … + n = n(n + 1)/2, and 1² + … + n² = n(n + 1)(2n + 1)/6. They're proved by induction: show it's true for n = 1, then that n implies n + 1."),
    ("h_mat", "Matrices", "Higher math", 10, ["f_sys"], g_mat, "Matrix multiplication: entry (i, j) is row i of the first times column j of the second (multiply pairs and add). Order matters: AB is usually not BA."),
    ("h_det", "Determinants", "Higher math", 11, ["h_mat"], g_det, "For 2×2, det = ad − bc. For 3×3, expand along a row: each entry times the determinant of what's left when you cross out its row and column, with signs + − +. det = 0 means the matrix has no inverse."),
    ("h_eig", "Eigenvalues", "Higher math", 13, ["h_det", "f_quad"], g_eig, "An eigenvector v of A only gets stretched: Av = λv. Eigenvalues solve det(A − λI) = 0. For 2×2 that's λ² − (trace)λ + det = 0."),
    ("s_mean", "Mean, median & range", "Stats & probability", 3, ["f_frac"], g_mean, "Mean: add up and divide by the count. Median: sort, take the middle (average the two middles if the count is even). Range: max − min. The median resists outliers; the mean doesn't."),
    ("s_prob", "Probability basics", "Stats & probability", 4, ["f_frac"], g_prob, "P(event) = favourable outcomes / total outcomes, when all are equally likely. Two dice give 36 outcomes. Probabilities run from 0 (impossible) to 1 (certain)."),
    ("s_indep", "Compound probability", "Stats & probability", 6, ["s_prob"], g_indep, "For independent events, P(A and B) = P(A)·P(B). Without replacement, the second probability changes: after drawing a red, there's one fewer red and one fewer marble."),
    ("s_binom", "Binomial probability", "Stats & probability", 9, ["s_indep", "h_comb"], g_binom, "n independent tries, each a success with probability p: P(exactly k) = C(n, k)·pᵏ·(1 − p)ⁿ⁻ᵏ. C(n, k) counts which tries are the successes."),
    ("s_ev", "Expected value", "Stats & probability", 7, ["s_prob"], g_ev, "Expected value = Σ(value × probability): the average per play in the long run. A game is fair when the expected profit is 0."),
    ("s_sd", "Standard deviation", "Stats & probability", 8, ["s_mean", "f_exp"], g_sd, "Standard deviation measures spread. Find the mean, square each value's distance from it, average those (the variance), then take the square root."),
    ("s_z", "z-scores", "Stats & probability", 9, ["s_sd"], g_z, "z = (x − μ)/σ: how many standard deviations a value is from the mean. z = 2 is two SDs above. In a normal distribution, about 68% of data lies within z = ±1 and 95% within ±2."),
]
TOPICS = {t[0]: {"id": t[0], "name": t[1], "track": t[2], "level": t[3], "pre": t[4], "gen": t[5], "lesson": t[6]} for t in T}
TRACKS = ["Foundations", "Geometry & trig", "Calculus", "Higher math", "Stats & probability"]
PLACEMENT = ["f_add", "f_frac", "f_exp", "f_lin1", "f_lin2", "f_slope", "f_fact", "f_quad", "f_log", "t_trig", "c_lim", "c_deriv", "c_rules", "c_int", "c_defint", "c_usub"]


# =====================================================================================
# checking answers
# =====================================================================================
def parse(text):
    s = sp()
    from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application, convert_xor
    t = re.sub(r"√\s*(\d+(?:\.\d+)?|[a-zA-Z])", r"sqrt(\1)", text.strip()).replace("√", "sqrt").replace("π", "pi").replace("−", "-").replace("×", "*").replace("÷", "/").replace("·", "*")
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"(?i)\+\s*c\b\s*$", "", t)                       # +C on antiderivatives
    t = re.sub(r"^\s*[a-zA-Z]\s*(\([^)]*\))?\s*=\s*", "", t)       # "y = ...", "f(x) = ..."
    t = re.sub(r"(\d)\s*%$", r"\1/100", t)
    loc = {"x": s.Symbol("x"), "y": s.Symbol("y"), "t": s.Symbol("t"), "e": s.E, "pi": s.pi, "i": s.I, "ln": s.log,
           "sqrt": s.sqrt, "sin": s.sin, "cos": s.cos, "tan": s.tan, "exp": s.exp, "log": s.log}
    return parse_expr(t, local_dict=loc, transformations=standard_transformations + (implicit_multiplication_application, convert_xor))


def same(a, b, approx=False):
    s = sp()
    try:
        d = s.simplify(a - b)
        if d == 0:
            return True
        v = complex(s.N(d))
        tol = 0.011 if approx else 1e-9
        return abs(v) <= tol * max(1, abs(complex(s.N(b))) if not approx else 1)
    except Exception:
        return False


def _split(text):
    text = text.replace("±", "+-")
    parts = [p for p in re.split(r",|;|\band\b|\bor\b", text) if p.strip()]
    out = []
    for p in parts:
        if "+-" in p:
            a, b = p.split("+-", 1)
            out += [a + "+(" + b + ")", a + "-(" + b + ")"]
        else:
            out.append(p)
    return out


def check(prob, text):
    """Returns (correct: bool, note: str)."""
    s = sp()
    kind, ans = prob["kind"], prob["ans"]
    text = (text or "").strip()
    if not text:
        return False, "No answer given."
    try:
        if kind == "str":
            return text.replace(" ", "").lstrip("0") == ans.lstrip("0"), ""
        if kind == "set":
            got = [parse(p) for p in _split(text)]
            want = [parse(p) for p in _split(ans)]
            ok = len(got) == len(want) and all(any(same(g, w) for g in got) for w in want)
            return ok, "" if ok or len(got) == len(want) else f"There should be {len(want)} answer{'s' if len(want) > 1 else ''}."
        if kind == "point":
            nums = [parse(p) for p in re.sub(r"[()\[\]]|[a-zA-Z]\s*=", "", text).split(",") if p.strip()]
            want = [parse(p) for p in re.sub(r"[()]", "", ans).split(",")]
            return len(nums) == 2 and all(same(g, w) for g, w in zip(nums, want)), ""
        if kind == "matrix":
            got = [int(n) for n in re.findall(r"-?\d+", text)]
            want = [int(n) for n in re.findall(r"-?\d+", ans)]
            return got == want, ""
        if kind == "ineq":
            x = s.Symbol("x")
            g = s.solveset(parse(text.replace("=<", "<=").replace("=>", ">=")), x, s.S.Reals)
            w = s.solveset(parse(ans), x, s.S.Reals)
            return g == w, ""
        if kind == "antideriv":
            x = s.Symbol(prob.get("var", "x"))
            return same(s.diff(parse(text), x), parse(prob["integrand"])), ""
        g = parse(text)
        w = parse(ans)
        ok = same(g, w, approx=(kind == "approx"))
        if ok and kind == "expanded" and "(" in text:
            return False, "Right value, but write it expanded (no brackets)."
        if ok and kind == "factored" and "(" not in text:
            return False, "That's the same polynomial, but it needs to be in factored form, like (x + 2)(x - 3)."
        if ok and kind == "radical" and prob.get("forbid", "#").replace(" ", "") in text.replace(" ", ""):
            return False, "Right value, but simplify the root."
        return ok, ""
    except Exception:
        return False, "I couldn't read that as math. Examples: 3/4, 2x + 1, sqrt(2), 3pi, x < 5, (2, -3)."


# =====================================================================================
# progress, unlocking, placement
# =====================================================================================
def state(prog):
    """prog: {topics: {id: {right, seen, recent: [0/1]}}, placed: [ids], placement_done: bool}"""
    tp = prog.setdefault("topics", {})
    placed = set(prog.get("placed", []))
    out = []
    for tid, t in TOPICS.items():
        r = tp.get(tid, {})
        recent = r.get("recent", [])
        mastered = tid in placed or (len(recent) >= 5 and sum(recent[-6:]) >= 5) or r.get("streak", 0) >= 5
        out.append({"id": tid, "name": t["name"], "track": t["track"], "level": t["level"], "pre": t["pre"], "mastered": mastered,
                    "placed": tid in placed, "right": r.get("right", 0), "seen": r.get("seen", 0), "streak": r.get("streak", 0)})
    done = {o["id"] for o in out if o["mastered"]}
    for o in out:
        o["open"] = o["mastered"] or all(p in done for p in o["pre"])
    return out


def record(prog, tid, ok):
    r = prog.setdefault("topics", {}).setdefault(tid, {"right": 0, "seen": 0, "streak": 0, "recent": []})
    r["seen"] += 1
    r["right"] += 1 if ok else 0
    r["streak"] = r["streak"] + 1 if ok else 0
    r["recent"] = (r.get("recent", []) + [1 if ok else 0])[-8:]


def place(prog, highest_ok):
    """Placement: every topic at or below the level of the highest checkpoint passed counts as known."""
    lvl = TOPICS[highest_ok]["level"] if highest_ok else 0
    prog["placed"] = sorted(t for t, v in TOPICS.items() if v["level"] <= lvl)
    prog["placement_done"] = True
    return lvl


def new_problem(tid):
    t = TOPICS[tid]
    for _ in range(20):
        try:
            p = t["gen"]()
            p.update(topic=tid, topic_name=t["name"])
            return p
        except Exception:
            continue
    raise RuntimeError("couldn't make a problem")


def pick_mixed(prog):
    st = [o for o in state(prog) if o["open"]]
    if not st:
        return "f_add"
    weights = [1 if o["mastered"] else 3 for o in st]
    return R.choices([o["id"] for o in st], weights)[0]


def lesson(tid):
    t = TOPICS[tid]
    ex = new_problem(tid)
    return {"id": tid, "name": t["name"], "track": t["track"], "text": t["lesson"],
            "example": {"q": ex["q"], "ans": ex["ans"], "steps": ex["steps"]}, "pre": [TOPICS[p]["name"] for p in t["pre"]]}
