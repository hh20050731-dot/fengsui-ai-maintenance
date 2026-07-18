"""生成引风机对象隔离图册与几何重叠报告。

只读取 blender-model-work/input/induced-draft-fan.glb。脚本不会保存或导出模型，
不会拆分、删除、重命名、减面，也不会把候选名称写回任何对象。
"""

from __future__ import annotations

import hashlib
import json
import math
import struct
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "input" / "induced-draft-fan.glb"
ISOLATION_DIR = ROOT / "previews" / "object-isolation"
DETAIL_DIR = ISOLATION_DIR / "_detail"
KEY_DIR = ROOT / "previews" / "key-candidates"
REPORT_DIR = ROOT / "reports"
OVERLAP_JSON = REPORT_DIR / "overlap_analysis.json"
OVERLAP_MD = REPORT_DIR / "overlap_analysis.md"
IDENTIFICATION_JSON = REPORT_DIR / "object_identification.json"
IDENTIFICATION_MD = REPORT_DIR / "object_identification.md"

WIDTH = 1200
HEIGHT = 800
KEY_OBJECTS = (
    "SHELL", "SHELL001", "SHELL002", "SHELL008", "SHELL009",
    "SHELL010", "SHELL019", "SHELL021", "SHELL023",
)
OVERLAP_PAIRS = (
    ("SHELL", "SHELL002"),
    ("SHELL001", "SHELL008"),
    ("SHELL009", "SHELL019"),
    ("SHELL010", "SHELL021"),
    ("SHELL020", "SHELL022"),
    ("SHELL024", "SHELL025"),
)
VIEW_DIRECTIONS = {
    "isometric": (1.6, -1.6, 1.2),
    "front": (0.0, -1.0, 0.0),
    "side": (1.0, 0.0, 0.0),
    "top": (0.0, 0.0, 1.0),
}


def ensure_dirs() -> None:
    for path in (ISOLATION_DIR, DETAIL_DIR, KEY_DIR, REPORT_DIR):
        path.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def import_model() -> list[bpy.types.Object]:
    if not INPUT.is_file():
        raise FileNotFoundError(INPUT)
    bpy.ops.import_scene.gltf(filepath=str(INPUT))
    bpy.context.view_layer.update()
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

    def source_order(obj: bpy.types.Object) -> tuple[int, int]:
        if obj.name == "Cube":
            return (0, 0)
        if obj.name == "SHELL":
            return (1, 0)
        if obj.name.startswith("SHELL") and obj.name[5:].isdigit():
            return (2, int(obj.name[5:]))
        return (3, 0)

    return sorted(objects, key=source_order)


def vec(value: Any) -> list[float]:
    return [round(float(component), 6) for component in value]


def bounds(obj: bpy.types.Object) -> tuple[Vector, Vector, Vector, float, list[Vector]]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    maximum = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    center = (minimum + maximum) * 0.5
    radius = max((maximum - minimum).length * 0.5, 0.01)
    return minimum, maximum, center, radius, corners


def combined_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector, Vector, float]:
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    minimum = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    maximum = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    center = (minimum + maximum) * 0.5
    return minimum, maximum, center, max((maximum - minimum).length * 0.5, 0.1)


def mesh_metrics(obj: bpy.types.Object, index: int) -> dict[str, Any]:
    mesh: bpy.types.Mesh = obj.data
    mesh.calc_loop_triangles()
    minimum, maximum, center, radius, _ = bounds(obj)
    return {
        "index": index,
        "originalName": obj.name,
        "vertexCount": len(mesh.vertices),
        "faceCount": len(mesh.polygons),
        "triangleCount": len(mesh.loop_triangles),
        "dimensions": vec(maximum - minimum),
        "center": vec(center),
        "boundingBox": {"min": vec(minimum), "max": vec(maximum)},
        "materials": [material.name for material in mesh.materials if material],
        "parent": obj.parent.name if obj.parent else None,
        "children": [child.name for child in obj.children],
        "isolationImage": f"previews/object-isolation/{index:03d}_{obj.name}.png",
    }


def make_material(name: str, color: tuple[float, float, float], alpha: float = 1.0) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, alpha)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF") if material.node_tree else None
    if shader:
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Roughness"].default_value = 0.38
        shader.inputs["Metallic"].default_value = 0.05
        if "Alpha" in shader.inputs:
            shader.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        try:
            material.surface_render_method = "DITHERED"
        except Exception:
            try:
                material.blend_method = "BLEND"
            except Exception:
                pass
    return material


def configure_scene(model_center: Vector, model_radius: float) -> tuple[bpy.types.Object, bpy.types.Collection]:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background") if scene.world.node_tree else None
    if background:
        background.inputs["Color"].default_value = (0.018, 0.026, 0.038, 1.0)
        background.inputs["Strength"].default_value = 0.62

    helpers = bpy.data.collections.new("CATALOG_RENDER_HELPERS")
    scene.collection.children.link(helpers)
    camera_data = bpy.data.cameras.new("CatalogCamera")
    camera = bpy.data.objects.new("CatalogCamera", camera_data)
    helpers.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.lens = 50
    camera_data.clip_start = max(model_radius * 0.001, 0.001)
    camera_data.clip_end = model_radius * 12
    scene.camera = camera

    lights = (
        ("CatalogKey", (1.5, -1.8, 2.2), 2.3),
        ("CatalogFill", (-1.8, -0.5, 1.0), 1.15),
        ("CatalogRim", (0.2, 2.0, 1.8), 1.65),
    )
    for name, direction, energy in lights:
        light_data = bpy.data.lights.new(name, type="SUN")
        light_data.energy = energy
        light_data.angle = math.radians(12)
        light = bpy.data.objects.new(name, light_data)
        helpers.objects.link(light)
        direction_vector = Vector(direction).normalized()
        light.location = model_center + direction_vector * model_radius * 3
        light.rotation_euler = (model_center - light.location).to_track_quat("-Z", "Y").to_euler()
    return camera, helpers


def position_camera(camera: bpy.types.Object, center: Vector, radius: float, direction: tuple[float, float, float]) -> None:
    vector = Vector(direction).normalized()
    camera.location = center + vector * radius * 3.2
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = radius * 2.35
    camera.data.clip_start = max(radius * 0.001, 0.001)
    camera.data.clip_end = radius * 12
    bpy.context.view_layer.update()


def projected_area(corners: list[Vector], direction: tuple[float, float, float]) -> float:
    view = Vector(direction).normalized()
    reference_up = Vector((0.0, 0.0, 1.0))
    if abs(view.dot(reference_up)) > 0.95:
        reference_up = Vector((0.0, 1.0, 0.0))
    right = reference_up.cross(view).normalized()
    up = view.cross(right).normalized()
    horizontal = [corner.dot(right) for corner in corners]
    vertical = [corner.dot(up) for corner in corners]
    return max(max(horizontal) - min(horizontal), 1e-9) * max(max(vertical) - min(vertical), 1e-9)


def best_view(obj: bpy.types.Object) -> tuple[float, float, float]:
    _, _, _, _, corners = bounds(obj)
    candidates = (
        VIEW_DIRECTIONS["isometric"], VIEW_DIRECTIONS["front"], VIEW_DIRECTIONS["side"], VIEW_DIRECTIONS["top"],
        (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (-1.6, 1.6, 1.2),
    )
    return max(candidates, key=lambda direction: projected_area(corners, direction))


def render(path: Path) -> None:
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def set_mesh_material(obj: bpy.types.Object, material: bpy.types.Material) -> tuple[list[bpy.types.Material | None], list[int]]:
    mesh: bpy.types.Mesh = obj.data
    old_materials = list(mesh.materials)
    old_indices = [polygon.material_index for polygon in mesh.polygons]
    mesh.materials.clear()
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.material_index = 0
    return old_materials, old_indices


def restore_mesh_material(obj: bpy.types.Object, state: tuple[list[bpy.types.Material | None], list[int]]) -> None:
    mesh: bpy.types.Mesh = obj.data
    old_materials, old_indices = state
    mesh.materials.clear()
    for material in old_materials:
        mesh.materials.append(material)
    for polygon, material_index in zip(mesh.polygons, old_indices):
        polygon.material_index = material_index


def create_reference_objects(objects: list[bpy.types.Object], material: bpy.types.Material, collection: bpy.types.Collection) -> dict[str, bpy.types.Object]:
    references: dict[str, bpy.types.Object] = {}
    for source in objects:
        clone = source.copy()
        clone.data = source.data.copy()
        clone.name = f"REFERENCE_{source.name}"
        clone.data.materials.clear()
        clone.data.materials.append(material)
        for polygon in clone.data.polygons:
            polygon.material_index = 0
        try:
            clone.visible_shadow = False
        except Exception:
            pass
        collection.objects.link(clone)
        references[source.name] = clone
    return references


def prepare_target(objects: list[bpy.types.Object], references: dict[str, bpy.types.Object], target: bpy.types.Object, material: bpy.types.Material) -> tuple[list[bpy.types.Material | None], list[int]]:
    for obj in objects:
        obj.hide_render = obj != target
    for name, reference in references.items():
        reference.hide_render = name == target.name
    return set_mesh_material(target, material)


def finish_target(objects: list[bpy.types.Object], references: dict[str, bpy.types.Object], target: bpy.types.Object, state: tuple[list[bpy.types.Material | None], list[int]]) -> None:
    restore_mesh_material(target, state)
    target.hide_render = True
    for reference in references.values():
        reference.hide_render = False
    for obj in objects:
        obj.hide_render = True


def render_isolation_catalog(objects: list[bpy.types.Object], metrics: list[dict[str, Any]], camera: bpy.types.Object, model_center: Vector, model_radius: float, references: dict[str, bpy.types.Object], green: bpy.types.Material, orange: bpy.types.Material) -> None:
    for obj, item in zip(objects, metrics):
        state = prepare_target(objects, references, obj, green if item["index"] % 2 else orange)
        try:
            direction = best_view(obj)
            position_camera(camera, model_center, model_radius, direction)
            render(ISOLATION_DIR / f"{item['index']:03d}_{obj.name}.png")

            _, _, target_center, target_radius, _ = bounds(obj)
            detail_radius = max(target_radius, model_radius * 0.015)
            position_camera(camera, target_center, detail_radius, direction)
            render(DETAIL_DIR / f"{item['index']:03d}_{obj.name}.png")
            item["selectedViewDirection"] = vec(direction)
        finally:
            finish_target(objects, references, obj, state)


def render_key_candidates(objects_by_name: dict[str, bpy.types.Object], all_objects: list[bpy.types.Object], camera: bpy.types.Object, model_center: Vector, model_radius: float, references: dict[str, bpy.types.Object], material: bpy.types.Material) -> None:
    for name in KEY_OBJECTS:
        target = objects_by_name[name]
        state = prepare_target(all_objects, references, target, material)
        try:
            for view_name, direction in VIEW_DIRECTIONS.items():
                position_camera(camera, model_center, model_radius, direction)
                render(KEY_DIR / f"{name}_{view_name}.png")

            section_direction = VIEW_DIRECTIONS["isometric"]
            position_camera(camera, model_center, model_radius, section_direction)
            distance = (camera.location - model_center).length
            camera.data.clip_start = distance * 0.98
            render(KEY_DIR / f"{name}_section.png")
            camera.data.clip_start = max(model_radius * 0.001, 0.001)
        finally:
            finish_target(all_objects, references, target, state)


def matrix_equal(left: Matrix, right: Matrix, tolerance: float = 1e-6) -> bool:
    return all(abs(left[row][column] - right[row][column]) <= tolerance for row in range(4) for column in range(4))


def quantized(value: Vector, scale: float = 1_000_000.0) -> tuple[int, int, int]:
    return tuple(round(float(component) * scale) for component in value)


def hash_quantized_points(points: list[tuple[int, int, int]]) -> str:
    digest = hashlib.sha256()
    for point in sorted(points):
        digest.update(struct.pack("<qqq", *point))
    return digest.hexdigest()


def world_vertex_hash(obj: bpy.types.Object) -> str:
    return hash_quantized_points([quantized(obj.matrix_world @ vertex.co) for vertex in obj.data.vertices])


def world_face_hash(obj: bpy.types.Object) -> str:
    matrix = obj.matrix_world
    vertices = [quantized(matrix @ vertex.co) for vertex in obj.data.vertices]
    face_hashes: list[bytes] = []
    for polygon in obj.data.polygons:
        digest = hashlib.sha256()
        for point in sorted(vertices[index] for index in polygon.vertices):
            digest.update(struct.pack("<qqq", *point))
        face_hashes.append(digest.digest())
    aggregate = hashlib.sha256()
    for face_hash in sorted(face_hashes):
        aggregate.update(face_hash)
    return aggregate.hexdigest()


def local_vertices_equal(left: bpy.types.Object, right: bpy.types.Object, tolerance: float = 1e-6) -> bool:
    if len(left.data.vertices) != len(right.data.vertices):
        return False
    return all((a.co - b.co).length <= tolerance for a, b in zip(left.data.vertices, right.data.vertices))


def topology_equal(left: bpy.types.Object, right: bpy.types.Object) -> bool:
    if len(left.data.polygons) != len(right.data.polygons):
        return False
    return all(tuple(a.vertices) == tuple(b.vertices) for a, b in zip(left.data.polygons, right.data.polygons))


def bbox_equal(left: bpy.types.Object, right: bpy.types.Object, tolerance: float = 1e-5) -> bool:
    left_min, left_max, _, _, _ = bounds(left)
    right_min, right_max, _, _, _ = bounds(right)
    return (left_min - right_min).length <= tolerance and (left_max - right_max).length <= tolerance


def material_names(obj: bpy.types.Object) -> list[str]:
    return sorted(material.name for material in obj.data.materials if material)


def analyze_pair(left: bpy.types.Object, right: bpy.types.Object) -> dict[str, Any]:
    vertex_equal = local_vertices_equal(left, right)
    face_equal = topology_equal(left, right)
    transform_equal = matrix_equal(left.matrix_world, right.matrix_world)
    bounds_equal = bbox_equal(left, right)
    world_vertices_equal = len(left.data.vertices) == len(right.data.vertices) and world_vertex_hash(left) == world_vertex_hash(right)
    world_faces_equal = len(left.data.polygons) == len(right.data.polygons) and world_face_hash(left) == world_face_hash(right)
    exact_duplicate = world_vertices_equal and world_faces_equal
    left_dimensions = bounds(left)[1] - bounds(left)[0]
    right_dimensions = bounds(right)[1] - bounds(right)[0]
    planar_pair = min(left_dimensions) <= 1e-6 and min(right_dimensions) <= 1e-6
    coplanar = exact_duplicate or (bounds_equal and planar_pair)
    materials_left, materials_right = material_names(left), material_names(right)
    only_material_different = exact_duplicate and materials_left != materials_right
    if exact_duplicate:
        inner_outer = "否：世界坐标和面几何一致，不是可区分的内外表面"
    elif bounds_equal and min(len(left.data.polygons), len(right.data.polygons)) > 1000:
        inner_outer = "可能：包围盒相同但顶点或拓扑不同，疑似内外表面；必须人工剖视确认"
    else:
        inner_outer = "无法认定为内外表面"
    return {
        "pair": [left.name, right.name],
        "localVertexCoordinatesIdentical": vertex_equal,
        "faceTopologyIdentical": face_equal,
        "worldTransformIdentical": transform_equal,
        "boundingBoxIdentical": bounds_equal,
        "worldVertexSetIdentical": world_vertices_equal,
        "worldFaceGeometryIdentical": world_faces_equal,
        "coplanarOverlap": coplanar,
        "innerOuterAssessment": inner_outer,
        "materials": {left.name: materials_left, right.name: materials_right},
        "onlyMaterialDifferent": only_material_different,
        "completeDuplicate": exact_duplicate,
        "deletionAuthorized": False,
        "conclusion": (
            "几何与世界位置完全重复；本轮仅记录，不删除" if exact_duplicate
            else "不是完全重复对象；保留并等待人工判断"
        ),
    }


def write_overlap_report(results: list[dict[str, Any]]) -> None:
    payload = {
        "analysisStatus": "complete",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "input": str(INPUT),
        "tolerance": {"coordinates": 1e-6, "boundingBox": 1e-5},
        "pairs": results,
        "safety": {"objectsDeleted": False, "modelModified": False},
    }
    OVERLAP_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# 引风机对象重叠与重复检测",
        "",
        "> 本报告只比较隔离副本中的几何与变换，不删除对象，也不据此自动修改模型。",
        "",
        "| 对象对 | 顶点顺序相同 | 拓扑相同 | 世界变换相同 | 包围盒相同 | 共面重叠 | 仅材质不同 | 完全重复 |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for item in results:
        yes_no = lambda value: "是" if value else "否"
        lines.append(
            f"| {item['pair'][0]} / {item['pair'][1]} | {yes_no(item['localVertexCoordinatesIdentical'])} | "
            f"{yes_no(item['faceTopologyIdentical'])} | {yes_no(item['worldTransformIdentical'])} | "
            f"{yes_no(item['boundingBoxIdentical'])} | {yes_no(item['coplanarOverlap'])} | "
            f"{yes_no(item['onlyMaterialDifferent'])} | {yes_no(item['completeDuplicate'])} |"
        )
    lines.extend(["", "## 逐对结论", ""])
    for item in results:
        lines.extend([
            f"### {item['pair'][0]} / {item['pair'][1]}",
            "",
            f"- 内外表面判断：{item['innerOuterAssessment']}",
            f"- 材质：`{item['pair'][0]}` = {item['materials'][item['pair'][0]]}；`{item['pair'][1]}` = {item['materials'][item['pair'][1]]}",
            f"- 结论：{item['conclusion']}",
            "",
        ])
    OVERLAP_MD.write_text("\n".join(lines), encoding="utf-8")


def classification_for(item: dict[str, Any]) -> tuple[str, float, str]:
    name = item["originalName"]
    dimensions = item["dimensions"]
    position = item["center"]
    geometry = f"中心({', '.join(f'{v:.3f}' for v in position)})，尺寸({', '.join(f'{v:.3f}' for v in dimensions)})，三角面{item['triangleCount']}"
    if name in {"SHELL", "SHELL002"}:
        return "casing_or_duct", 0.72, f"{geometry}；多视图显示为跨越主体的长风道和大壳体轮廓，无法继续区分具体壳段"
    if name in {"SHELL001", "SHELL008"}:
        return "impeller_or_rotor", 0.78, f"{geometry}；位于机壳内部中心，隔离图呈高细节圆盘/叶片状旋转体"
    if name in {"SHELL011", "SHELL012", "SHELL013", "SHELL014", "SHELL015", "SHELL016", "SHELL017", "SHELL018"}:
        return "fastener", 0.86, f"{geometry}；八个同尺寸小圆柱件沿圆周等角分布，视觉上符合紧固/定位件组"
    if name in {"SHELL020", "SHELL022"}:
        return "zero_thickness_surface", 0.99, f"{geometry}；一个包围盒维度为零且仅2个三角面，属于零厚度面片"
    if name in {"SHELL003", "SHELL004", "SHELL005", "SHELL006", "SHELL007"}:
        return "structural_frame", 0.58, f"{geometry}；位于矩形边框四角或边缘，疑似框架/边条，仍需人工确认"
    if name in {"SHELL009", "SHELL010", "SHELL019", "SHELL021", "SHELL023", "SHELL024", "SHELL025"}:
        return "internal_plate", 0.52, f"{geometry}；位于主体内部或侧壁，整体较薄，可能是内板、导流板或支撑片"
    return "unknown", 0.08, f"{geometry}；隔离视图仍不足以判断实体用途"


def write_identification_report(metrics: list[dict[str, Any]]) -> None:
    objects: list[dict[str, Any]] = []
    for item in metrics:
        category, confidence, evidence = classification_for(item)
        objects.append({
            "originalName": item["originalName"],
            "candidateCategory": category,
            "confidence": confidence,
            "visualEvidence": evidence,
            "requiresManualReview": True,
            "isolationImage": item["isolationImage"],
            "metrics": {
                "vertexCount": item["vertexCount"],
                "triangleCount": item["triangleCount"],
                "dimensions": item["dimensions"],
                "center": item["center"],
            },
        })
    payload = {
        "analysisStatus": "complete",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "input": str(INPUT),
        "objects": objects,
        "physicalGeometry": {
            "motor": "physical geometry not present",
            "coupling": "physical geometry not present",
            "bearing": "physical geometry not present",
            "shaft": "physical geometry not present",
        },
        "faultScenarioSupport": {
            "normalOperation": "supported by complete visible fan assembly",
            "impellerImbalance": "partially supported by impeller_or_rotor candidates SHELL001/SHELL008",
            "bearingOverheat": "not physically supported: bearing geometry not present",
            "couplingMisalignment": "not physically supported: coupling and shaft geometry not present",
            "overallAssessment": "insufficient for four physically accurate fault scenes",
        },
        "safety": {
            "modelModified": False,
            "objectsRenamed": False,
            "splitPerformed": False,
            "decimationPerformed": False,
            "exportPerformed": False,
        },
    }
    IDENTIFICATION_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# 引风机对象隔离识别报告",
        "",
        "> 候选分类只存在于本报告，不写回模型。所有对象仍需人工复核。",
        "",
        "## 物理几何完整性",
        "",
        "- motor：physical geometry not present",
        "- coupling：physical geometry not present",
        "- bearing：physical geometry not present",
        "- shaft：physical geometry not present",
        "- 四种故障场景支持度：不足。仅正常整机展示和叶轮不平衡具备可见几何基础；轴承温升、联轴器不对中缺少对应实体。",
        "",
        "## 对象候选分类",
        "",
        "| 原始名称 | 候选类别 | 置信度 | 人工复核 | 隔离图 | 视觉证据 |",
        "|---|---|---:|---|---|---|",
    ]
    for item in objects:
        image = Path(item["isolationImage"]).name
        lines.append(
            f"| {item['originalName']} | {item['candidateCategory']} | {item['confidence']:.0%} | "
            f"是 | [查看](../previews/object-isolation/{image}) | {item['visualEvidence']} |"
        )
    lines.extend([
        "",
        "## 安全结论",
        "",
        "- 未删除对象，未拆分，未重命名，未减面，未导出或替换网站模型。",
        "- 不建议按松散几何岛自动拆分；部分Mesh包含数百至数万个未焊接几何岛，会产生大量碎片。",
        "- 任何正式命名前必须由人工结合隔离图、设备图纸和真实部件结构确认。",
    ])
    IDENTIFICATION_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ensure_dirs()
    input_hash_before = hashlib.sha256(INPUT.read_bytes()).hexdigest()
    clear_scene()
    objects = import_model()
    if len(objects) != 27:
        raise RuntimeError(f"预期27个Mesh，实际{len(objects)}个")
    metrics = [mesh_metrics(obj, index) for index, obj in enumerate(objects, 1)]
    _, _, model_center, model_radius = combined_bounds(objects)
    camera, helpers = configure_scene(model_center, model_radius)
    reference_material = make_material("CATALOG_REFERENCE_GRAY", (0.42, 0.48, 0.54), 0.10)
    green = make_material("CATALOG_TARGET_GREEN", (0.0, 0.95, 0.64), 1.0)
    orange = make_material("CATALOG_TARGET_ORANGE", (1.0, 0.36, 0.06), 1.0)
    references = create_reference_objects(objects, reference_material, helpers)
    for obj in objects:
        obj.hide_render = True

    render_isolation_catalog(objects, metrics, camera, model_center, model_radius, references, green, orange)
    render_key_candidates({obj.name: obj for obj in objects}, objects, camera, model_center, model_radius, references, green)
    overlap_results = [analyze_pair(bpy.data.objects[left], bpy.data.objects[right]) for left, right in OVERLAP_PAIRS]
    write_overlap_report(overlap_results)
    write_identification_report(metrics)

    input_hash_after = hashlib.sha256(INPUT.read_bytes()).hexdigest()
    if input_hash_before != input_hash_after:
        raise RuntimeError("输入GLB哈希在分析过程中发生变化")
    print(json.dumps({
        "status": "complete",
        "objects": len(objects),
        "isolationImages": len(list(ISOLATION_DIR.glob("[0-9][0-9][0-9]_*.png"))),
        "keyCandidateImages": len(list(KEY_DIR.glob("*.png"))),
        "overlapReport": str(OVERLAP_MD),
        "identificationReport": str(IDENTIFICATION_MD),
        "inputUnchanged": True,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
