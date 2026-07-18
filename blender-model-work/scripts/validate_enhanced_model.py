from __future__ import annotations

import json
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "input" / "induced-draft-fan.glb"
PREVIEW_DIR = ROOT / "previews" / "enhanced-model"
REPORT = ROOT / "reports" / "enhanced_model_report.json"

ORIGINAL_NAMES = ["Cube", "SHELL"] + [f"SHELL{i:03d}" for i in range(1, 26)]
NEW_NAMES = [
    "motor",
    "motor_shaft",
    "coupling_input",
    "coupling_element",
    "coupling_output",
    "main_shaft",
    "bearing_drive_housing",
    "bearing_drive_locator",
    "bearing_non_drive_housing",
    "bearing_non_drive_locator",
    "drive_base",
    "rotation_axis",
    "impeller_group",
    "casing_group",
]
COLLECTIONS = [
    "Fan_Digital_Twin",
    "EXISTING_CASING",
    "EXISTING_IMPELLER",
    "EXISTING_INTERNAL_PARTS",
    "ADDED_DRIVE_SYSTEM",
    "SEMANTIC_LOCATORS",
    "UNRESOLVED_PARTS",
]
MATERIALS = [
    "MAT_CASING",
    "MAT_IMPELLER",
    "MAT_MOTOR",
    "MAT_SHAFT",
    "MAT_COUPLING",
    "MAT_BEARING",
    "MAT_BASE",
    "MAT_FAULT_ORANGE",
    "MAT_FAULT_RED",
]
PREVIEWS = [
    "01_original_vs_enhanced.png",
    "02_full_assembly_isometric.png",
    "03_casing_transparent.png",
    "04_impeller_highlight.png",
    "05_drive_bearing_highlight.png",
    "06_coupling_shaft_highlight.png",
    "07_drive_system_only.png",
    "08_fault_scenarios_overview.png",
    "09_node_hierarchy.png",
    "10_rotation_axis_validation.png",
    "enhanced_model_montage.png",
]


def distance_to_axis(point: Vector, origin: Vector, direction: Vector) -> float:
    return (point - origin).cross(direction.normalized()).length


def main() -> None:
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    origin = Vector(report["rotationAxis"]["origin"])
    direction = Vector(report["rotationAxis"]["direction"]).normalized()
    missing_original = [name for name in ORIGINAL_NAMES if bpy.data.objects.get(name) is None]
    missing_new = [name for name in NEW_NAMES if bpy.data.objects.get(name) is None]
    missing_collections = [name for name in COLLECTIONS if bpy.data.collections.get(name) is None]
    missing_materials = [name for name in MATERIALS if bpy.data.materials.get(name) is None]
    missing_previews = [name for name in PREVIEWS if not (PREVIEW_DIR / name).exists()]
    axis_objects = [
        "motor",
        "motor_shaft",
        "coupling_input",
        "coupling_element",
        "coupling_output",
        "main_shaft",
        "bearing_drive_housing",
        "bearing_non_drive_housing",
        "bearing_drive_locator",
        "bearing_non_drive_locator",
        "rotation_axis",
    ]
    axis_distances = {
        name: round(distance_to_axis(bpy.data.objects[name].matrix_world.translation, origin, direction), 8)
        for name in axis_objects
    }
    result = {
        "missingOriginalObjects": missing_original,
        "missingEnhancedObjects": missing_new,
        "missingCollections": missing_collections,
        "missingMaterials": missing_materials,
        "missingPreviews": missing_previews,
        "impellerParents": {
            name: bpy.data.objects[name].parent.name if bpy.data.objects[name].parent else None
            for name in ("SHELL001", "SHELL008")
        },
        "casingParents": {
            name: bpy.data.objects[name].parent.name if bpy.data.objects[name].parent else None
            for name in ("SHELL", "SHELL002")
        },
        "impellerOriginDistancesToAxis": {
            name: round(distance_to_axis(bpy.data.objects[name].matrix_world.translation, origin, direction), 8)
            for name in ("SHELL001", "SHELL008")
        },
        "semanticLocatorProperties": {
            name: {
                "semantic_locator": bpy.data.objects[name].get("semantic_locator"),
                "physical_geometry": bpy.data.objects[name].get("physical_geometry"),
                "fault_type": bpy.data.objects[name].get("fault_type"),
                "display_name_zh": bpy.data.objects[name].get("display_name_zh"),
            }
            for name in ("bearing_drive_locator", "bearing_non_drive_locator")
        },
        "axisObjectDistances": axis_distances,
        "formalGlbExported": bpy.context.scene.get("formal_glb_exported"),
        "analysisOnly": bpy.context.scene.get("analysis_only"),
        "previewCount": len(PREVIEWS) - len(missing_previews),
    }
    failures = []
    for key in ("missingOriginalObjects", "missingEnhancedObjects", "missingCollections", "missingMaterials", "missingPreviews"):
        if result[key]:
            failures.append(key)
    if any(parent != "impeller_group" for parent in result["impellerParents"].values()):
        failures.append("impellerParents")
    if any(parent != "casing_group" for parent in result["casingParents"].values()):
        failures.append("casingParents")
    if max(result["impellerOriginDistancesToAxis"].values()) > 0.001:
        failures.append("impellerOrigins")
    if max(axis_distances.values()) > 0.001:
        failures.append("axisAlignment")
    if result["formalGlbExported"] is not False or result["analysisOnly"] is not True:
        failures.append("sceneSafetyFlags")
    result["valid"] = not failures
    result["failures"] = failures
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if failures:
        raise RuntimeError(f"增强模型校验失败: {failures}")


if __name__ == "__main__":
    main()
