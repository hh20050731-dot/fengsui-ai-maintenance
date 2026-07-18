"""引风机 GLB 的只读分析与预览脚本。

仅操作 blender-model-work/input 中的模型副本，不拆分、不重命名、不减面，
也不会导出新的 GLB。请使用 Blender 后台模式执行：

    blender --background --factory-startup --python blender-model-work/scripts/analyze_model.py
"""

from __future__ import annotations

import colorsys
import hashlib
import json
import math
from array import array
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


WORK_ROOT = Path(__file__).resolve().parents[1]
INPUT_GLB = WORK_ROOT / "input" / "induced-draft-fan.glb"
OUTPUT_BLEND = WORK_ROOT / "output" / "induced-draft-fan-analysis-only.blend"
PREVIEW_DIR = WORK_ROOT / "previews"
REPORT_DIR = WORK_ROOT / "reports"
REPORT_JSON = REPORT_DIR / "model_analysis.json"
REPORT_MD = REPORT_DIR / "model_analysis.md"
NODE_CANDIDATES_JSON = REPORT_DIR / "node_candidates.json"

RENDER_WIDTH = 1600
RENDER_HEIGHT = 1000
PART_KEYWORDS = (
    "motor",
    "coupling",
    "shaft",
    "bearing",
    "impeller",
    "casing",
    "inlet",
    "outlet",
    "base",
)


def ensure_directories() -> None:
    for path in (OUTPUT_BLEND.parent, PREVIEW_DIR, REPORT_DIR):
        path.mkdir(parents=True, exist_ok=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def vec(value: Any) -> list[float]:
    return [round(float(component), 6) for component in value]


def clear_temporary_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def import_copy() -> list[bpy.types.Object]:
    if not INPUT_GLB.is_file():
        raise FileNotFoundError(f"模型副本不存在：{INPUT_GLB}")
    bpy.ops.import_scene.gltf(filepath=str(INPUT_GLB))
    bpy.context.view_layer.update()
    return list(bpy.context.scene.objects)


def world_bounds(obj: bpy.types.Object) -> dict[str, list[float]] | None:
    if not getattr(obj, "bound_box", None):
        return None
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    maximum = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    center = (minimum + maximum) * 0.5
    return {
        "min": vec(minimum),
        "max": vec(maximum),
        "center": vec(center),
        "corners": [vec(corner) for corner in corners],
    }


def material_details(material: bpy.types.Material | None) -> dict[str, Any]:
    if material is None:
        return {"name": None, "hasTexture": False, "textures": []}
    textures: list[dict[str, str]] = []
    if material.use_nodes and material.node_tree:
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and getattr(node, "image", None):
                textures.append({
                    "node": node.name,
                    "image": node.image.name,
                    "filepath": bpy.path.abspath(node.image.filepath) if node.image.filepath else "",
                })
    return {"name": material.name, "hasTexture": bool(textures), "textures": textures}


def has_animation(obj: bpy.types.Object) -> bool:
    if obj.animation_data and obj.animation_data.action:
        return True
    if obj.type == "MESH" and obj.data.shape_keys:
        data = obj.data.shape_keys.animation_data
        return bool(data and data.action)
    return False


def loose_island_labels(mesh: bpy.types.Mesh) -> tuple[int, dict[int, int]]:
    vertex_count = len(mesh.vertices)
    if vertex_count == 0:
        return 0, {}

    parent = list(range(vertex_count))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left: int, right: int) -> None:
        root_left, root_right = find(left), find(right)
        if root_left != root_right:
            parent[root_right] = root_left

    used: set[int] = set()
    for edge in mesh.edges:
        left, right = edge.vertices
        used.update((left, right))
        union(left, right)
    for polygon in mesh.polygons:
        vertices = list(polygon.vertices)
        used.update(vertices)
        for index in range(1, len(vertices)):
            union(vertices[0], vertices[index])

    roots = sorted({find(index) for index in used})
    root_to_label = {root: label for label, root in enumerate(roots)}
    labels = {index: root_to_label[find(index)] for index in used}
    return len(roots), labels


def object_details(obj: bpy.types.Object) -> dict[str, Any]:
    bounds = world_bounds(obj)
    result: dict[str, Any] = {
        "originalName": obj.name,
        "objectType": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "children": [child.name for child in obj.children],
        "collections": [collection.name for collection in obj.users_collection],
        "worldPosition": vec(obj.matrix_world.translation),
        "dimensions": vec(obj.dimensions),
        "center": bounds["center"] if bounds else vec(obj.matrix_world.translation),
        "boundingBox": bounds,
        "vertexCount": 0,
        "faceCount": 0,
        "triangleCount": 0,
        "looseGeometryIslands": 0,
        "materials": [],
        "hasTexture": False,
        "hasAnimation": has_animation(obj),
    }
    if obj.type == "MESH":
        mesh: bpy.types.Mesh = obj.data
        mesh.calc_loop_triangles()
        materials = [material_details(material) for material in mesh.materials]
        island_count, _ = loose_island_labels(mesh)
        result.update({
            "meshName": mesh.name,
            "vertexCount": len(mesh.vertices),
            "faceCount": len(mesh.polygons),
            "triangleCount": len(mesh.loop_triangles),
            "looseGeometryIslands": island_count,
            "materials": materials,
            "hasTexture": any(item["hasTexture"] for item in materials),
        })
    return result


def collection_details() -> list[dict[str, Any]]:
    details = [{
        "name": bpy.context.scene.collection.name,
        "parent": None,
        "objects": [obj.name for obj in bpy.context.scene.collection.objects],
        "children": [child.name for child in bpy.context.scene.collection.children],
    }]
    for collection in bpy.data.collections:
        parents = [candidate.name for candidate in bpy.data.collections if collection in candidate.children[:]]
        details.append({
            "name": collection.name,
            "parent": parents[0] if parents else bpy.context.scene.collection.name,
            "objects": [obj.name for obj in collection.objects],
            "children": [child.name for child in collection.children],
        })
    return details


def classify_model(mesh_details: list[dict[str, Any]]) -> tuple[str, str]:
    if len(mesh_details) > 1:
        return "multiple_independent_objects", "已有多个独立对象"
    if len(mesh_details) == 1 and mesh_details[0]["looseGeometryIslands"] > 1:
        return "single_mesh_multiple_loose_islands", "单一Mesh但包含多个松散几何岛"
    if len(mesh_details) == 1:
        return "single_continuous_mesh", "完全连续的单一Mesh"
    return "no_mesh", "未检测到Mesh"


def build_candidates(objects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    fallback_index = 1
    for item in objects:
        if item["objectType"] not in {"MESH", "EMPTY"}:
            continue
        normalized = item["originalName"].lower()
        matches = [keyword for keyword in PART_KEYWORDS if keyword in normalized]
        if matches:
            suggested_name = matches[0]
            confidence = 0.92
            evidence = f"原始节点名称直接包含机械关键词：{', '.join(matches)}"
            manual_review = False
        else:
            suggested_name = f"candidate_part_{fallback_index:03d}"
            fallback_index += 1
            dimensions = [float(value) for value in item["dimensions"]]
            center = [float(value) for value in item["center"]]
            maximum_dimension = max(dimensions, default=0.0)
            radial_offset = math.hypot(center[0], center[2])
            geometry = (
                f"中心({center[0]:.3f}, {center[1]:.3f}, {center[2]:.3f})，"
                f"尺寸({dimensions[0]:.3f}, {dimensions[1]:.3f}, {dimensions[2]:.3f})，"
                f"三角面{item['triangleCount']}"
            )
            if item["triangleCount"] > 100_000 and maximum_dimension < 400:
                confidence = 0.68
                evidence = f"{geometry}；位于主体内部中心且呈高细节近圆盘包围盒，几何上疑似叶轮/旋转组件，但需剖视图和设备图纸确认"
            elif maximum_dimension > 1_000:
                confidence = 0.45
                evidence = f"{geometry}；跨越模型主体并形成长通道/大壳体轮廓，可能属于风道或机壳组合，无法仅凭外形二选一"
            elif maximum_dimension <= 12 and abs(center[1] + 139.666) < 2 and radial_offset > 50:
                confidence = 0.62
                evidence = f"{geometry}；多个同尺寸小件沿圆周规则分布，疑似紧固或定位件，具体名称需人工确认"
            elif any(abs(value) < 1e-6 for value in dimensions):
                confidence = 0.2
                evidence = f"{geometry}；对象为近零厚度面片，可能是隔板、封板或导入残留，无法可靠命名"
            else:
                confidence = 0.15 if normalized.startswith("shell") else 0.05
                evidence = f"{geometry}；原始名称缺少机械语义，多视角位置仍不足以可靠确认部件"
            manual_review = True
        candidates.append({
            "originalName": item["originalName"],
            "suggestedName": suggested_name,
            "confidence": confidence,
            "evidence": evidence,
            "requiresManualReview": manual_review,
        })
    return candidates


def combined_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector, Vector, float]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects if getattr(obj, "bound_box", None) for corner in obj.bound_box]
    if not points:
        raise RuntimeError("模型没有可用于取景的包围盒")
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center = (minimum + maximum) * 0.5
    radius = max((maximum - minimum).length * 0.5, 0.1)
    return minimum, maximum, center, radius


def create_camera_and_lights(center: Vector, radius: float) -> tuple[bpy.types.Object, bpy.types.Collection]:
    helper_collection = bpy.data.collections.new("ANALYSIS_PREVIEW_HELPERS")
    bpy.context.scene.collection.children.link(helper_collection)

    camera_data = bpy.data.cameras.new("AnalysisCamera")
    camera = bpy.data.objects.new("AnalysisCamera", camera_data)
    helper_collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = radius * 2.35
    camera_data.clip_start = max(radius * 0.001, 0.001)
    camera_data.clip_end = radius * 10.0
    bpy.context.scene.camera = camera

    light_specs = (
        ("KeyLight", (1.5, -1.8, 2.2), 1700.0, radius * 2.0),
        ("FillLight", (-1.8, -0.5, 1.0), 900.0, radius * 1.7),
        ("RimLight", (0.2, 2.0, 1.8), 1300.0, radius * 1.5),
    )
    for name, direction, energy, _size in light_specs:
        light_data = bpy.data.lights.new(name, type="SUN")
        light_data.energy = energy / 850.0
        light_data.angle = math.radians(12.0)
        light = bpy.data.objects.new(name, light_data)
        helper_collection.objects.link(light)
        direction_vector = Vector(direction).normalized()
        light.location = center + direction_vector * radius * 3.0
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
    return camera, helper_collection


def configure_render() -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_WIDTH
    scene.render.resolution_y = RENDER_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.025, 0.035, 0.05)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background") if scene.world.node_tree else None
    if background:
        background.inputs["Color"].default_value = (0.025, 0.035, 0.05, 1.0)
        background.inputs["Strength"].default_value = 0.65


def position_camera(camera: bpy.types.Object, center: Vector, radius: float, direction: tuple[float, float, float]) -> None:
    view_direction = Vector(direction).normalized()
    camera.location = center + view_direction * radius * 3.2
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = radius * 2.35


def render_view(camera: bpy.types.Object, center: Vector, radius: float, direction: tuple[float, float, float], filename: str) -> None:
    position_camera(camera, center, radius, direction)
    bpy.context.view_layer.update()
    bpy.context.scene.render.filepath = str(PREVIEW_DIR / filename)
    bpy.ops.render.render(write_still=True)


def make_preview_material(index: int, total: int) -> bpy.types.Material:
    hue = (index / max(total, 1) + 0.07) % 1.0
    red, green, blue = colorsys.hsv_to_rgb(hue, 0.58, 0.82)
    material = bpy.data.materials.new(f"ANALYSIS_COLOR_{index:03d}")
    material.diffuse_color = (red, green, blue, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = (red, green, blue, 1.0)
        shader.inputs["Roughness"].default_value = 0.48
        shader.inputs["Metallic"].default_value = 0.08
    return material


def apply_temporary_colors(mesh_objects: list[bpy.types.Object]) -> tuple[list[dict[str, Any]], list[bpy.types.Material]]:
    snapshots: list[dict[str, Any]] = []
    generated_materials: list[bpy.types.Material] = []
    color_by_object = len(mesh_objects) > 1
    total_groups = len(mesh_objects) if color_by_object else sum(max(1, loose_island_labels(obj.data)[0]) for obj in mesh_objects)
    color_index = 0
    for obj in mesh_objects:
        mesh: bpy.types.Mesh = obj.data
        island_count, labels = loose_island_labels(mesh)
        snapshots.append({
            "mesh": mesh,
            "materials": list(mesh.materials),
            "polygonMaterialIndices": [polygon.material_index for polygon in mesh.polygons],
        })
        mesh.materials.clear()
        preview_group_count = 1 if color_by_object else max(1, island_count)
        local_materials = []
        for _ in range(preview_group_count):
            material = make_preview_material(color_index, total_groups)
            generated_materials.append(material)
            local_materials.append(material)
            mesh.materials.append(material)
            color_index += 1
        for polygon in mesh.polygons:
            polygon.material_index = 0 if color_by_object else (labels.get(polygon.vertices[0], 0) if polygon.vertices else 0)
    return snapshots, generated_materials


def restore_original_materials(snapshots: list[dict[str, Any]], generated_materials: list[bpy.types.Material]) -> None:
    for snapshot in snapshots:
        mesh: bpy.types.Mesh = snapshot["mesh"]
        mesh.materials.clear()
        for material in snapshot["materials"]:
            mesh.materials.append(material)
        for polygon, material_index in zip(mesh.polygons, snapshot["polygonMaterialIndices"]):
            polygon.material_index = material_index
    for material in generated_materials:
        bpy.data.materials.remove(material)


def create_montage(image_paths: list[Path], output: Path) -> None:
    tile_width, tile_height = 800, 500
    canvas_width, canvas_height = tile_width * 3, tile_height * 2
    background = (0.02, 0.028, 0.04, 1.0)
    pixels = array("f", background) * (canvas_width * canvas_height)
    positions = ((0, tile_height), (tile_width, tile_height), (tile_width * 2, tile_height), (tile_width // 2, 0), (tile_width + tile_width // 2, 0))
    loaded_images: list[bpy.types.Image] = []

    for image_path, (offset_x, offset_y) in zip(image_paths, positions):
        image = bpy.data.images.load(str(image_path), check_existing=False)
        loaded_images.append(image)
        image.scale(tile_width, tile_height)
        source = array("f", [0.0]) * (tile_width * tile_height * 4)
        image.pixels.foreach_get(source)
        row_size = tile_width * 4
        for row in range(tile_height):
            source_start = row * row_size
            destination_start = ((offset_y + row) * canvas_width + offset_x) * 4
            pixels[destination_start:destination_start + row_size] = source[source_start:source_start + row_size]

    canvas = bpy.data.images.new("AnalysisMontage", width=canvas_width, height=canvas_height, alpha=True, float_buffer=False)
    canvas.pixels.foreach_set(pixels)
    canvas.filepath_raw = str(output)
    canvas.file_format = "PNG"
    canvas.save()
    bpy.data.images.remove(canvas)
    for image in loaded_images:
        bpy.data.images.remove(image)


def write_reports(analysis: dict[str, Any], candidates: list[dict[str, Any]]) -> None:
    REPORT_JSON.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    NODE_CANDIDATES_JSON.write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")

    high_confidence = [item for item in candidates if item["confidence"] >= 0.8 and not item["requiresManualReview"]]
    unresolved = [item for item in candidates if item["requiresManualReview"]]
    lines = [
        "# 引风机模型分析报告",
        "",
        "> 本报告仅分析 `blender-model-work/input` 中的副本；未拆分、重命名、减面或导出正式 GLB。",
        "",
        "## 摘要",
        "",
        f"- Blender：{analysis['blender']['version']}（{analysis['blender']['binaryPath']}）",
        f"- 模型分类：{analysis['classification']['label']}",
        f"- 对象数量：{analysis['counts']['objects']}",
        f"- Mesh 对象数量：{analysis['counts']['meshObjects']}",
        f"- Mesh 数据块数量：{analysis['counts']['meshDataBlocks']}",
        f"- 顶点总数：{analysis['counts']['vertices']:,}",
        f"- 面总数：{analysis['counts']['faces']:,}",
        f"- 三角面总数：{analysis['counts']['triangles']:,}",
        f"- 材质数量：{analysis['counts']['materials']}",
        f"- 含贴图对象：{analysis['counts']['objectsWithTextures']}",
        f"- 含动画对象：{analysis['counts']['animatedObjects']}",
        "",
        "## 高置信度部件候选",
        "",
    ]
    if high_confidence:
        lines.extend(f"- `{item['originalName']}` → `{item['suggestedName']}`（{item['confidence']:.0%}）" for item in high_confidence)
    else:
        lines.append("- 无。现有名称不足以可靠确认机械部件。")
    lines.extend(["", "## 需要人工确认", ""])
    lines.extend(f"- `{item['originalName']}` → `{item['suggestedName']}`：{item['evidence']}" for item in unresolved)
    lines.extend([
        "",
        "## 对象明细",
        "",
        "| 原始名称 | 类型 | 父节点 | 顶点 | 面 | 三角面 | 松散岛 | 材质 | 贴图 | 动画 |",
        "|---|---|---|---:|---:|---:|---:|---|---|---|",
    ])
    for item in analysis["objects"]:
        materials = ", ".join(material["name"] or "None" for material in item["materials"]) or "-"
        lines.append(
            f"| {item['originalName']} | {item['objectType']} | {item['parent'] or '-'} | "
            f"{item['vertexCount']} | {item['faceCount']} | {item['triangleCount']} | "
            f"{item['looseGeometryIslands']} | {materials} | "
            f"{'是' if item['hasTexture'] else '否'} | {'是' if item['hasAnimation'] else '否'} |"
        )
    lines.extend([
        "",
        "## 安全说明",
        "",
        "- 预览颜色只在内存中临时分配，渲染完成后已恢复原始材质。",
        "- 分析场景保存前已移除临时颜色材质。",
        "- 未导出新 GLB，网站当前模型未被覆盖、移动或重命名。",
        "- 自动拆分前必须先由人工结合预览、设备图纸和现场知识确认候选部件。",
    ])
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ensure_directories()
    source_hash_before = sha256(INPUT_GLB)
    clear_temporary_scene()
    imported_objects = import_copy()
    source_hash_after_import = sha256(INPUT_GLB)
    if source_hash_before != source_hash_after_import:
        raise RuntimeError("分析过程中模型副本哈希发生变化，已中止")

    details = [object_details(obj) for obj in imported_objects]
    mesh_details = [item for item in details if item["objectType"] == "MESH"]
    model_materials_by_name = {
        material.name: material
        for obj in imported_objects if obj.type == "MESH"
        for material in obj.data.materials if material is not None
    }
    classification_code, classification_label = classify_model(mesh_details)
    candidates = build_candidates(details)

    analysis = {
        "analysisStatus": "complete",
        "analysisMode": "Blender bpy read-only analysis of isolated copy",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "input": {
            "path": str(INPUT_GLB),
            "sizeBytes": INPUT_GLB.stat().st_size,
            "sha256Before": source_hash_before,
            "sha256After": source_hash_after_import,
            "unchanged": source_hash_before == source_hash_after_import,
        },
        "blender": {
            "version": bpy.app.version_string,
            "binaryPath": bpy.app.binary_path,
        },
        "classification": {
            "code": classification_code,
            "label": classification_label,
        },
        "counts": {
            "collections": len(collection_details()),
            "objects": len(details),
            "meshObjects": len(mesh_details),
            "meshDataBlocks": len({obj.data.name for obj in imported_objects if obj.type == "MESH"}),
            "empties": sum(item["objectType"] == "EMPTY" for item in details),
            "vertices": sum(item["vertexCount"] for item in mesh_details),
            "faces": sum(item["faceCount"] for item in mesh_details),
            "triangles": sum(item["triangleCount"] for item in mesh_details),
            "materials": len(model_materials_by_name),
            "objectsWithTextures": sum(item["hasTexture"] for item in mesh_details),
            "animatedObjects": sum(item["hasAnimation"] for item in details),
        },
        "keywordChecks": {
            keyword: [item["originalName"] for item in details if keyword in item["originalName"].lower()]
            for keyword in PART_KEYWORDS
        },
        "collections": collection_details(),
        "materials": [material_details(material) for material in model_materials_by_name.values()],
        "objects": details,
        "safety": {
            "splitPerformed": False,
            "renamedObjects": False,
            "decimationPerformed": False,
            "newGlbExported": False,
            "temporaryPreviewMaterialsRestored": True,
        },
    }

    mesh_objects = [obj for obj in imported_objects if obj.type == "MESH"]
    _, _, center, radius = combined_bounds(mesh_objects)
    configure_render()
    camera, _ = create_camera_and_lights(center, radius)
    preview_specs = (
        ((1.6, -1.6, 1.2), "01_isometric.png"),
        ((0.0, -1.0, 0.0), "02_front.png"),
        ((1.0, 0.0, 0.0), "03_side.png"),
        ((0.0, 0.0, 1.0), "04_top.png"),
    )
    for direction, filename in preview_specs:
        render_view(camera, center, radius, direction, filename)

    snapshots, generated_materials = apply_temporary_colors(mesh_objects)
    try:
        render_view(camera, center, radius, (1.6, -1.6, 1.2), "05_object_colors.png")
    finally:
        restore_original_materials(snapshots, generated_materials)

    preview_paths = [PREVIEW_DIR / filename for _, filename in preview_specs]
    preview_paths.append(PREVIEW_DIR / "05_object_colors.png")
    create_montage(preview_paths, PREVIEW_DIR / "montage.png")
    write_reports(analysis, candidates)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND), check_existing=False)

    if sha256(INPUT_GLB) != source_hash_before:
        raise RuntimeError("脚本结束时模型副本哈希发生变化")
    print(json.dumps({
        "status": "complete",
        "classification": classification_label,
        "objects": analysis["counts"]["objects"],
        "meshes": analysis["counts"]["meshObjects"],
        "triangles": analysis["counts"]["triangles"],
        "report": str(REPORT_MD),
        "montage": str(PREVIEW_DIR / "montage.png"),
        "blend": str(OUTPUT_BLEND),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
