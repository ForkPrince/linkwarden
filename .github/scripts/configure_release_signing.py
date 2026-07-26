import re

with open("android/app/build.gradle") as f:
    content = f.read()

release_match = re.search(r"(\s+)(release\s*\{)", content)
if not release_match:
    print("release block not found")
    exit(0)

indent = release_match.group(1)
start = release_match.end() - 1
depth = 1
pos = start
while depth > 0 and pos < len(content):
    if content[pos] == "{":
        depth += 1
    elif content[pos] == "}":
        depth -= 1
    pos += 1

release_block = content[start:pos]

if "signingConfig" not in release_block:
    signing_line = indent + indent + "signingConfig signingConfigs.debug\n"
    content = content[: pos - 1] + signing_line + content[pos - 1 :]
    with open("android/app/build.gradle", "w") as f:
        f.write(content)
    print("Added debug signing fallback to release build type")
else:
    print("Release build type already has a signing config")
