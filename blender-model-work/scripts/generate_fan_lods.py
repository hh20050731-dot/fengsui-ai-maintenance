"""Create non-destructive LOD copies from the validated enhanced fan blend."""

from __future__ import annotations

import json
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "blender-model-work" / "output" / "induced-draft-fan-enhanced-v1.blend"
PUBLIC = ROOT / "apps" / "web" / "public" / "models"
REPORT_JSON = ROOT / "blender-model-work" / "reports" / "induced-draft-fan-lod-validation.json"
REPORT_MD = ROOT / "blender-model-work" / "reports" / "induced-draft-fan-lod-validation.md"
TARGETS = {"lod0": 120_000, "lod1": 30_000, "lod2": 8_000}
REQUIRED = [
    "Fan_Digital_Twin", "casing_group", "impeller_group", "motor", "motor_shaft", "main_shaft",
    "coupling_input", "coupling_element", "coupling_output", "coupling_guard", "bearing_drive_housing",
    "bearing_drive_locator", "bearing_non_drive_housing", "bearing_non_drive_locator", "drive_base", "rotation_axis",
]


def triangle_count(obj):
    if obj.type != "MESH":
        return 0
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def total_triangles():
    return sum(triangle_count(obj) for obj in bpy.context.scene.objects)


def apply_decimation(target):
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    fixed = [obj for obj in meshes if not obj.name.startswith("SHELL")]
    reducible = [obj for obj in meshes if obj.name.startswith("SHELL") and triangle_count(obj) >= 80]
    fixed_triangles = sum(triangle_count(obj) for obj in fixed) + sum(triangle_count(obj) for obj in meshes if obj.name.startswith("SHELL") and triangle_count(obj) < 80)
    reducible_triangles = sum(triangle_count(obj) for obj in reducible)
    ratio = max(0.002, min(1.0, (target - fixed_triangles) / max(1, reducible_triangles)))
    for obj in reducible:
        modifier = obj.modifiers.new("competition_lod_decimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except RuntimeError:
            obj.modifiers.remove(modifier)
        finally:
            obj.select_set(False)
    return ratio


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=False, export_yup=True,
        export_extras=True, export_cameras=False, export_lights=False, export_apply=True,
    )


def main():
    rows = []
    for lod, target in TARGETS.items():
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
        before = total_triangles()
        ratio = apply_decimation(target)
        after = total_triangles()
        for obj in bpy.context.scene.objects:
            obj["lod_level"] = lod
            obj["lod_source"] = "induced-draft-fan-enhanced-v1"
        output = PUBLIC / f"induced-draft-fan-{lod}.glb"
        export(output)
        missing = [name for name in REQUIRED if bpy.data.objects.get(name) is None]
        rows.append({"lod": lod, "target": target, "trianglesBefore": before, "trianglesAfter": after, "decimationRatio": round(ratio, 6), "sizeBytes": output.stat().st_size, "path": str(output.relative_to(ROOT)).replace("\\", "/"), "requiredNodes": len(REQUIRED), "missingNodes": missing, "valid": not missing and (80_000 <= after <= 150_000 if lod == "lod0" else 20_000 <= after <= 40_000 if lod == "lod1" else 5_000 <= after <= 10_000)})
        print(f"[fan-lod] {lod}: {before} -> {after}, ratio={ratio:.5f}", flush=True)
    report = {"source": str(SOURCE.relative_to(ROOT)).replace("\\", "/"), "dataBoundary": "Non-destructive LOD copies for visualization; source model unchanged.", "lods": rows, "valid": all(row["valid"] for row in rows)}
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = ["# 引风机LOD验证报告", "", "> LOD由增强版v1非破坏性复制后减面生成，源模型未覆盖；用途仅为比赛原型可视化。", "", "| LOD | 目标三角面 | 实际三角面 | 文件大小 | 关键节点 | 验证 |", "|---|---:|---:|---:|---:|---|"]
    for row in rows:
        lines.append(f"| {row['lod'].upper()} | {row['target']} | {row['trianglesAfter']} | {row['sizeBytes'] / 1024:.1f} KB | {row['requiredNodes'] - len(row['missingNodes'])}/{row['requiredNodes']} | {'通过' if row['valid'] else '未通过'} |")
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    if not report["valid"]:
        raise RuntimeError("One or more fan LODs did not meet triangle/node targets")


if __name__ == "__main__":
    main()
