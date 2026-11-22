#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
罗森塔尔 Rosenthal · 生成 tabBar 图标

为什么需要这一步：微信小程序的 tabBar 图标必须是**本地 PNG**，不支持 SVG 雪碧图
（README-小程序移植指南 §一）。原型的 5 个 tab 图标写在 index.html 的 <symbol> 雪碧图里，
本脚本把那 5 个 symbol 光栅化成 5×2 = 10 张透明底 PNG，颜色分别取 app.json 里
tabBar 的 color(#9498A0) 与 selectedColor(#D97A3D)。

做法：把每条 SVG 几何元素在自己的 viewBox 里细分取样成折线，用 Pillow 的
line(joint="curve") + 端帽圆点绘制，4 倍超采样后缩放回 81×81，得到干净的抗锯齿描边。
只依赖 Pillow，不引入 svg 渲染库。

用法：
    python tools/make_tab_icons.py            # 写入 ../assets/
    python tools/make_tab_icons.py --out DIR
"""
import argparse
import math
import os
import re

from PIL import Image, ImageDraw

SS = 4            # 超采样倍数
BOX = 24.0        # SVG viewBox 边长
SIZE = 81         # 输出边长（README 建议 81×81）
STROKE = 1.45     # 原型的图标描边宽度（viewBox 单位）
MAX_STEP = 0.05   # 折线细分步长（viewBox 单位）

OFF = "#9498A0"   # tabBar.color
ON = "#D97A3D"    # tabBar.selectedColor

# ------------------------------------------------------------------
# 1. 几何：每个 symbol 的元素表（从 prototype/index.html 的雪碧图 1:1 抄来）
# ------------------------------------------------------------------
ICONS = {
    "today": [
        ("circle", dict(cx=12, cy=12, r=4.2)),
        ("path", "M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3"
                 "M5.4 5.4l2.1 2.1M16.5 16.5l2.1 2.1M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1"),
    ],
    "growth": [
        ("path", "M3 20h18"),
        ("path", "M4 16.5l4.5-5 3.5 3 7-8.5"),
        ("path", "M15.5 6H19v3.5"),
    ],
    "week": [
        ("rect", dict(x=3.5, y=5, w=17, h=15.5, rx=3)),
        ("path", "M3.5 9.5h17M8 3v4M16 3v4"),
        ("path", "M8.5 14.5l2 2 4-4.5"),
    ],
    "shop": [
        ("path", "M4 8.5h16l-1.2 10a2.5 2.5 0 0 1-2.5 2.2H7.7A2.5 2.5 0 0 1 5.2 18.5z"),
        ("path", "M8.6 8.5V7a3.4 3.4 0 0 1 6.8 0v1.5"),
    ],
    "me": [
        ("circle", dict(cx=12, cy=8.4, r=3.9)),
        ("path", "M4.6 20.4c1.2-3.9 4-5.9 7.4-5.9s6.2 2 7.4 5.9"),
    ],
}

NUM = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")


def nums(s):
    """数值参数列表。注意 'a2.5 2.5 0 0 1-2.5 2.2' 这种把两个数粘在一起的写法，
    切分后会出现相邻的两个 token；这里对嵌套列表做展平，避免漏读参数。"""
    if isinstance(s, (list, tuple)):
        out = []
        for item in s:
            out.extend(nums(item))
        return out
    return [float(x) for x in NUM.findall(str(s))]


def num(s):
    """单个数值参数：像 nums 一样容错（可能是列表或字符串）。"""
    if isinstance(s, (list, tuple)):
        s = s[0] if s else "0"
    return float(NUM.findall(str(s))[0])


def arc_points(x0, y0, rx, ry, phi, laf, sf, x1, y1, steps=48):
    """按 SVG 规范把椭圆弧转成中心参数化后取样（F.6.5 端点→中心换算）。"""
    if rx == 0 or ry == 0:
        return [(x1, y1)]
    phi = math.radians(phi)
    cosp, sinp = math.cos(phi), math.sin(phi)
    dx2, dy2 = (x0 - x1) / 2.0, (y0 - y1) / 2.0
    x1p = cosp * dx2 + sinp * dy2
    y1p = -sinp * dx2 + cosp * dy2
    rx, ry = abs(rx), abs(ry)
    lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lam > 1:
        k = math.sqrt(lam)
        rx, ry = rx * k, ry * k
    sign = -1.0 if laf == sf else 1.0
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    co = sign * math.sqrt(max(0.0, num / den)) if den else 0.0
    cxp = co * (rx * y1p / ry)
    cyp = co * (-ry * x1p / rx)
    cx = cosp * cxp - sinp * cyp + (x0 + x1) / 2.0
    cy = sinp * cxp + cosp * cyp + (y0 + y1) / 2.0

    def angle(ux, uy, vx, vy):
        dot = ux * vx + uy * vy
        n = math.hypot(ux, uy) * math.hypot(vx, vy)
        a = math.acos(max(-1.0, min(1.0, dot / n))) if n else 0.0
        return -a if (ux * vy - uy * vx) < 0 else a

    th1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dth = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sf and dth > 0:
        dth -= 2 * math.pi
    elif sf and dth < 0:
        dth += 2 * math.pi

    pts = []
    for i in range(1, steps + 1):
        th = th1 + dth * i / steps
        pts.append((cx + rx * math.cos(th) * cosp - ry * math.sin(th) * sinp,
                    cy + rx * math.cos(th) * sinp + ry * math.sin(th) * cosp))
    return pts


def cubic_points(p0, p1, p2, p3, steps):
    out = []
    for i in range(1, steps + 1):
        t = i / float(steps)
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1]
        out.append((x, y))
    return out


def subpath(d, samples=14):
    """把一个 path 的 d 拆成若干条折线（每条以 M 开头，Z 只表示闭合）。"""
    toks = re.findall(r"[MmLlHhVvCcSsQqTtAaZz]|" + NUM.pattern, d)
    lines, cur, start, pos = [], [], None, (0.0, 0.0)
    cmd, i = None, 0

    def flush():
        nonlocal cur
        if len(cur) > 1:
            lines.append(list(cur))
        cur = []

    while i < len(toks):
        t = toks[i]
        if re.match(r"[A-Za-z]", t):
            cmd = t
            i += 1
            if cmd in "Zz":
                if start is not None:
                    cur.append(start)
                flush()
                pos = start if start else pos
                continue
        rel = cmd.islower()
        c = cmd.upper()

        if c == "M":
            x, y = num(toks[i]), num(toks[i + 1]); i += 2
            if rel:
                x, y = pos[0] + x, pos[1] + y
            flush(); cur = [(x, y)]; start = (x, y); pos = (x, y)
            cmd = "l" if rel else "L"
        elif c == "L":
            x, y = num(toks[i]), num(toks[i + 1]); i += 2
            if rel:
                x, y = pos[0] + x, pos[1] + y
            cur.append((x, y)); pos = (x, y)
        elif c == "H":
            x = num(toks[i]); i += 1
            if rel:
                x = pos[0] + x
            cur.append((x, pos[1])); pos = (x, pos[1])
        elif c == "V":
            y = num(toks[i]); i += 1
            if rel:
                y = pos[1] + y
            cur.append((pos[0], y)); pos = (pos[0], y)
        elif c == "C":
            v = nums(toks[i:i + 6]); i += 6
            pts = [(v[0], v[1]), (v[2], v[3]), (v[4], v[5])]
            if rel:
                pts = [(pos[0] + a, pos[1] + b) for a, b in pts]
            cur += cubic_points(pos, pts[0], pts[1], pts[2], samples)
            pos = pts[2]
        elif c == "S":
            v = nums(toks[i:i + 4]); i += 4
            pts = [(v[0], v[1]), (v[2], v[3])]
            if rel:
                pts = [(pos[0] + a, pos[1] + b) for a, b in pts]
            ctrl = cur[-2] if len(cur) >= 2 else pos
            c1 = (2 * pos[0] - ctrl[0], 2 * pos[1] - ctrl[1])
            cur += cubic_points(pos, c1, pts[0], pts[1], samples)
            pos = pts[1]
        elif c == "Q":
            v = nums(toks[i:i + 4]); i += 4
            q, end = (v[0], v[1]), (v[2], v[3])
            if rel:
                q = (pos[0] + q[0], pos[1] + q[1]); end = (pos[0] + end[0], pos[1] + end[1])
            c1 = (pos[0] + 2 / 3.0 * (q[0] - pos[0]), pos[1] + 2 / 3.0 * (q[1] - pos[1]))
            c2 = (end[0] + 2 / 3.0 * (q[0] - end[0]), end[1] + 2 / 3.0 * (q[1] - end[1]))
            cur += cubic_points(pos, c1, c2, end, samples)
            pos = end
        elif c == "A":
            v = nums(toks[i:i + 7]); i += 7
            rx, ry, phi, laf, sf, x, y = v
            if rel:
                x, y = pos[0] + x, pos[1] + y
            step = max(8, int(math.hypot(x - pos[0], y - pos[1]) / MAX_STEP))
            cur += arc_points(pos[0], pos[1], rx, ry, phi, int(laf), int(sf), x, y, min(step, 128))
            pos = (x, y)
        else:
            raise ValueError("unsupported path command: %s in %s" % (cmd, d))
    flush()
    return lines


LINE_STEP = 1.2  # 每段曲线取样点数（按弧长自适应）


def resample(pts, step=MAX_STEP):
    """把折线按弧长重新均匀取样，保证 Pillow 的 joint='curve' 有足够多的点。"""
    if len(pts) < 2:
        return pts
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        seg = math.hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(math.ceil(seg / step)))
        for k in range(1, n + 1):
            t = k / float(n)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def circle_points(cx, cy, r, steps):
    return [(cx + r * math.cos(2 * math.pi * i / steps), cy + r * math.sin(2 * math.pi * i / steps))
            for i in range(steps + 1)]


def round_rect_points(x, y, w, h, rx, steps_per_corner=16):
    """顺时针一圈：上边 → 右上角 → 右边 → 右下角 → 下边 → 左下角 → 左边 → 左上角。
    注意相邻两条边与圆角必须首尾相接，否则会让描边在图里来回折出「褶皱」。"""
    rx = min(rx, w / 2.0, h / 2.0)
    x1, y1 = x + rx, y + rx          # 左上圆心
    x2, y2 = x + w - rx, y + h - rx  # 右下圆心
    pts = [(x1, y)]                  # 上边起点
    pts.append((x2, y))              # 上边终点

    def corner(cx0, cy0, a0):
        for i in range(1, steps_per_corner + 1):
            th = a0 + (math.pi / 2) * i / steps_per_corner
            pts.append((cx0 + rx * math.cos(th), cy0 + rx * math.sin(th)))

    corner(x2, y1, -math.pi / 2)     # 右上角：-90° → 0°
    corner(x2, y2, 0.0)              # 右下角：0° → 90°
    corner(x1, y2, math.pi / 2)      # 左下角：90° → 180°
    corner(x1, y1, math.pi)          # 左上角：180° → 270°
    pts.append(pts[0])               # 回到起点闭合
    return pts


def render(name, color, s=SIZE, ss=SS):
    """在 ss 倍画布上画好再缩小，得到抗锯齿的透明底 PNG。"""
    k = s * ss / BOX                      # viewBox 单位 → 设备像素
    path_px = STROKE * k * 0.92           # 略收一点，81px 下更清爽
    wide = max(1, int(round(path_px)))
    img = Image.new("RGBA", (s * ss, s * ss), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    cx = cy = s * ss / 2.0

    def to_dev(pts):
        return [(cx + (x - BOX / 2.0) * k, cy + (y - BOX / 2.0) * k) for x, y in resample(pts, 0.35)]

    def stroke(polylines):
        """每条子路径单独成折线：绝不能把不同子路径连起来画，否则会出现穿图的直线。"""
        for line in polylines:
            dev = to_dev(line)
            if len(dev) < 2:
                continue
            dr.line(dev, fill=color, width=wide, joint="curve")
            for px, py in (dev[0], dev[-1]):     # 圆端帽，等价 SVG stroke-linecap="round"
                dr.ellipse([px - path_px / 2, py - path_px / 2,
                            px + path_px / 2, py + path_px / 2], fill=color)

    for kind, spec in ICONS[name]:
        if kind == "circle":
            stroke([circle_points(spec["cx"], spec["cy"], spec["r"], 96)])
        elif kind == "rect":
            stroke([round_rect_points(spec["x"], spec["y"], spec["w"], spec["h"], spec["rx"])])
        else:
            stroke(subpath(spec))
    img = img.resize((s, s), Image.LANCZOS)
    bbox = img.getbbox()                  # 内容边界，用来确认没触边
    return img, bbox


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--out", default=os.path.join(here, "..", "assets"))
    ap.add_argument("--size", type=int, default=SIZE)
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)

    # 先写一张 2× 预览图，方便人眼核对形状是否忠实于原型雪碧图
    made = []
    for name in ICONS:
        for suffix, color in (("", OFF), ("-on", ON)):
            img, bbox = render(name, color, args.size)
            fp = os.path.join(out, "tab-%s%s.png" % (name, suffix))
            img.save(fp, "PNG")
            made.append((os.path.basename(fp), img.size, bbox))

    # 预览拼图：5 列 × 2 行（上=未选中，下=选中）
    cell = args.size + 12
    sheet = Image.new("RGBA", (cell * 5, cell * 2), (246, 241, 232, 255))
    for col, name in enumerate(ICONS):
        for row, suffix in enumerate(("", "-on")):
            im = Image.open(os.path.join(out, "tab-%s%s.png" % (name, suffix)))
            sheet.alpha_composite(im, (col * cell + 6, row * cell + 6))
    sheet.save(os.path.join(out, "_preview-tabs.png"), "PNG")

    for n, size, bbox in made:
        print("  %-22s %sx%s  bbox=%s" % (n, size[0], size[1], bbox))
    print("写出 %d 张 PNG + 1 张预览 → %s" % (len(made), out))


if __name__ == "__main__":
    main()
