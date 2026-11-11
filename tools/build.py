#!/usr/bin/env python3
"""Build the public prototype site from a raw download of the design canvas.

Usage: python3 -I tools/build.py <raw_dir>

<raw_dir> is the folder the Artifact tool saved the canvas files into. It must hold
project/canvas.json, the page's project/*.dc.html files, artifact-type/dc-runtime.js
and one downloaded image per /_blob/<id> (named <id>.<ext>, anywhere under raw_dir).

Modes:
  --list    print the screens on the page and the image ids they use, then exit
  (default) rebuild the screens, support.js and img/ in the repo root
"""
import glob, json, os, re, shutil, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(REPO, "tools", "config.json")))
BLOB = re.compile(r"/_blob/([a-f0-9]{32})")
BARE = re.compile(r"(?<![a-zA-Z0-9/._-])([a-f0-9]{32})(?![a-zA-Z0-9._-])")


def page_boards(raw):
    canvas = json.load(open(os.path.join(raw, "project", "canvas.json")))
    pid = CFG["canvas_page_id"]
    w = CFG.get("screen_width")
    # only phone-size boards; wide boards (pattern sheets, palette comparisons) are not screens
    return [k for k in canvas["order"] if canvas["boards"][k].get("page") == pid
            and (not w or canvas["boards"][k].get("w") == w)]


def head_block(min_h):
    return (
        '<title>Celebrate</title>\n'
        '<meta name="robots" content="noindex">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="theme-color" content="#FBF8F4">\n'
        '<style>html{height:100%;overflow:hidden;background:#FBF8F4;display:flex;align-items:center;justify-content:center}'
        'body{flex:none;width:390px;height:var(--h,844px);overflow:hidden;zoom:var(--z,1)}</style>\n'
        '<script>(function(){var lw=0;function f(){var w=innerWidth,h=innerHeight;if(w===lw)return;lw=w;'
        'var z=w/390,H=h/z;if(H<MINH){z=h/MINH;H=MINH}var r=document.documentElement.style;'
        'r.setProperty("--z",z);r.setProperty("--h",Math.floor(H)+"px")}f();addEventListener("resize",f);'
        'addEventListener("orientationchange",function(){lw=0;setTimeout(f,300)})})();</script>'
    ).replace("MINH", str(min_h))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    raw = os.path.abspath(args[0])
    boards = page_boards(raw)
    if not boards:
        sys.exit("No screens found on canvas page %s" % CFG["canvas_page_id"])

    blobs = set()
    for b in boards:
        src = os.path.join(raw, "project", b)
        if not os.path.exists(src):
            sys.exit("Missing download: project/%s" % b)
        blobs |= set(BLOB.findall(open(src).read()))

    if "--list" in sys.argv:
        print("SCREENS", " ".join("project/" + b for b in boards))
        print("IMAGES", " ".join(sorted(blobs)))
        return

    # images: find each downloaded blob by id
    img_dir = os.path.join(REPO, "img")
    shutil.rmtree(img_dir, ignore_errors=True)
    os.makedirs(img_dir)
    img_name = {}
    for bid in sorted(blobs):
        hits = [p for p in glob.glob(os.path.join(raw, "**", bid + ".*"), recursive=True)]
        if not hits:
            sys.exit("Missing image download: %s" % bid)
        name = os.path.basename(hits[0])
        shutil.copy(hits[0], os.path.join(img_dir, name))
        img_name[bid] = name

    shutil.copy(os.path.join(raw, "artifact-type", "dc-runtime.js"), os.path.join(REPO, "support.js"))

    for old in glob.glob(os.path.join(REPO, "*.dc.html")):
        os.remove(old)
    for b in boards:
        s = open(os.path.join(raw, "project", b)).read()
        s = BLOB.sub(lambda m: "img/" + img_name[m.group(1)], s)
        # runtime data may hold bare image ids filled into src="/_blob/{{x}}" templates:
        # point the template at img/ and give every bare id its file name
        s = s.replace('"/_blob/{{', '"img/{{').replace("'/_blob/{{", "'img/{{")
        s = BARE.sub(lambda m: img_name[m.group(1)] if m.group(1) in img_name else m.group(0), s)
        if "<title>" in s:
            s = re.sub(r"<title>.*?</title>", lambda m: head_block(CFG["min_height"].get(b, CFG["min_height_default"])), s, count=1, flags=re.S)
        else:
            s = s.replace("<head>", "<head>\n" + head_block(CFG["min_height"].get(b, CFG["min_height_default"])), 1)
        i = s.index("<x-dc>")
        j = s.index("<div ", i)
        k = s.index(">", j)
        root = s[j:k]
        if "height: 844px" in root:
            s = s[:j] + root.replace("height: 844px", "height: var(--h, 844px)") + s[k:]
        else:
            print("WARN %s: root is not 844px tall, left at its own size" % b)
        open(os.path.join(REPO, os.path.basename(b)), "w").write(s)

    start = CFG["start_screen"]
    if start not in boards:
        print("WARN start screen %s is no longer on the page; update tools/config.json" % start)
    for page in ("index.html", os.path.join("tools", "artifact.html")):
        path = os.path.join(REPO, page)
        if os.path.exists(path):
            t = open(path).read()
            t = re.sub(r'<iframe src="[^"]*"', '<iframe src="%s"' % start, t)
            t = re.sub(r"location\.replace\('[^']*'\)", "location.replace('%s')" % start, t)
            open(path, "w").write(t)
    print("BUILT %d screens, %d images" % (len(boards), len(blobs)))


if __name__ == "__main__":
    main()
