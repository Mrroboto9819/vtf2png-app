# import subprocess
# from pathlib import Path
# import sys

# def convert_all_vtfs(input_path, output_path):
#     vtf2png = "./libs/vtf2png/vtf2png"
#     input_dir = Path(input_path).resolve()
#     output_dir = Path(output_path).resolve()

#     if not input_dir.is_dir():
#         print(f"❌ Input is not a directory: {input_dir}")
#         return

#     output_dir.mkdir(parents=True, exist_ok=True)

#     for vtf_file in input_dir.glob("*.vtf"):
#         output_file = output_dir / (vtf_file.stem + ".png")
#         print(f"🖼️  Converting {vtf_file.name} → {output_file.name}")
#         try:
#             subprocess.run([vtf2png, str(vtf_file), str(output_file)], check=True)
#         except subprocess.CalledProcessError:
#             print(f"❌ Failed to convert: {vtf_file.name}")

# if __name__ == "__main__":
#     if len(sys.argv) != 3:
#         print("Usage: python convert_vtfs.py <input_folder> <output_folder>")
#         sys.exit(1)

#     convert_all_vtfs(sys.argv[1], sys.argv[2])


# convert_vtfs.py

import subprocess
from pathlib import Path
import sys

def convert_all_vtfs(input_path, output_path):
    vtf2png = Path(__file__).resolve().parent / "libs/vtf2png/vtf2png"
    input_dir = Path(input_path).resolve()
    output_dir = Path(output_path).resolve()

    if not input_dir.is_dir():
        raise ValueError(f"Input is not a directory: {input_dir}")

    if not vtf2png.is_file():
        raise FileNotFoundError("vtf2png binary not found.")

    vtf2png.chmod(vtf2png.stat().st_mode | 0o111)  # ensure it's executable

    output_dir.mkdir(parents=True, exist_ok=True)

    vtf_files = list(input_dir.glob("*.vtf"))
    if not vtf_files:
        raise FileNotFoundError("No .vtf files found in input directory.")

    for vtf_file in vtf_files:
        output_file = output_dir / (vtf_file.stem + ".png")
        print(f"🖼️  Converting {vtf_file.name} → {output_file.name}")
        try:
            subprocess.run([str(vtf2png), str(vtf_file), str(output_file)], check=True)
        except subprocess.CalledProcessError:
            raise RuntimeError(f"Failed to convert: {vtf_file.name}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python convert_vtfs.py <input_folder> <output_folder>")
        sys.exit(1)

    convert_all_vtfs(sys.argv[1], sys.argv[2])
