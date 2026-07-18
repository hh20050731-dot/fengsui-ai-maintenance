from __future__ import annotations

import json
import math
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


WORK_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = WORK_ROOT.parent
SOURCE_BLEND = WORK_ROOT / "output" / "induced-draft-fan-enhanced-preview.blend"
OUTPUT_BLEND = WORK_ROOT / "output" / "induced-draft-fan-enhanced-v1.blend"
OUTPUT_GLB = WORK_ROOT / "output" / "induced-draft-fan-enhanced-v1.glb"
REPORT_DIR = WORK_ROOT / "reports"
PREVIEW_DIR = WORK_ROOT / "previews" / "enhanced-v1"

OUTPUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
REPORT_DIR.mkdir(parents=True, exist_ok=True)
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

ORIGINAL_NAMES = ["Cube", "SHELL"] + [f"SHELL{i:03d}" for i in range(1, 26)]
CASING_NAMES = ["SHELL", "SHELL002"]
IMPELLER_NAMES = ["SHELL001", "SHELL008"]
DRIVE_NAMES = [
    "motor",
    "motor_shaft",
    "main_shaft",
    "coupling_input",
    "coupling_element",
    "coupling_output",
    "bearing_drive_housing",
    "bearing_non_drive_housing",
    "drive_base",
]
LOCATOR_NAMES = ["bearing_drive_locator", "bearing_non_drive_locator", "rotation_axis"]
KEY_NODES = [
    "Fan_Digital_Twin",
    "casing_group",
    "impeller_group",
    "motor",
    "motor_shaft",
    "main_shaft",
    "coupling_input",
    "coupling_element",
    "coupling_output",
    "coupling_guard",
    "bearing_drive_housing",
    "bearing_drive_locator",
    "bearing_non_drive_housing",
    "bearing_non_drive_locator",
    "drive_base",
    "rotation_axis",
]
REQUIRED_MATERIALS = [
    "MAT_CASING",
    "MAT_IMPELLER",
    "MAT_MOTOR",
    "MAT_SHAFT",
    "MAT_COUPLING",
    "MAT_BEARING",
    "MAT_BASE",
    "MAT_GUARD",
]
AXIS_NAMES = [
    "motor",
    "motor_shaft",
    "main_shaft",
    "coupling_input",
    "coupling_element",
    "coupling_output",
    "bearing_drive_housing",
    "bearing_non_drive_housing",
    "bearing_drive_locator",
    "bearing_non_drive_locator",
    "rotation_axis",
]


def vec(value: Vector | Iterable[float], digits: int = 8) -> list[float]:
    return [round(float(component), digits) for component in value]


def mesh_triangles(obj: bpy.types.Object) -> int:
    if obj.type != "MESH":
        return 0
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def bounds(objects: Iterable[bpy.types.Object]) -> tuple[Vector, Vector, Vector, float]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == "MESH" for corner in obj.bound_box]
    if not points:
        raise RuntimeError("没有可用的Mesh包围盒")
    minimum = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    maximum = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    center = (minimum + maximum) * 0.5
    radius = max((maximum - minimum).length * 0.5, 1.0)
    return minimum, maximum, center, radius


def material(
    name: str,
    color: tuple[float, float, float],
    *,
    metallic: float,
    roughness: float,
    alpha: float = 1.0,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, alpha)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF") if result.node_tree else None
    if shader:
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        if "Alpha" in shader.inputs:
            shader.inputs["Alpha"].default_value = alpha
        if emission is not None:
            emission_input = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
            if emission_input:
                emission_input.default_value = (*emission, 1.0)
            strength_input = shader.inputs.get("Emission Strength")
            if strength_input:
                strength_input.default_value = emission_strength
    if alpha < 1.0:
        try:
            result.surface_render_method = "DITHERED"
        except Exception:
            try:
                result.blend_method = "BLEND"
            except Exception:
                pass
    return result


def apply_material(obj: bpy.types.Object, target: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(target)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def preserve_parent(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def distance_to_axis(point: Vector, origin: Vector, direction: Vector) -> float:
    return (point - origin).cross(direction.normalized()).length


def find_root_collection() -> bpy.types.Collection:
    result = bpy.data.collections.get("Fan_Digital_Twin")
    if result:
        return result
    result = bpy.data.collections.new("Fan_Digital_Twin")
    bpy.context.scene.collection.children.link(result)
    return result


def create_root_node(axis_origin: Vector, axis_direction: Vector) -> bpy.types.Object:
    existing = bpy.data.objects.get("Fan_Digital_Twin")
    if existing:
        return existing
    root_collection = find_root_collection()
    root = bpy.data.objects.new("Fan_Digital_Twin", None)
    root_collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 50.0
    root["semantic_model"] = True
    root["manufacturer_exact"] = False
    root["purpose"] = "digital_twin_visualization"
    root["model_version"] = "enhanced-v1"
    root["rotation_axis_origin"] = vec(axis_origin)
    root["rotation_axis_direction"] = vec(axis_direction)
    return root


def add_cube(name: str, location: Vector, dimensions: tuple[float, float, float], target_material: bpy.types.Material, collection: bpy.types.Collection) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, target_material)
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def create_guard_shell(
    axis_origin: Vector,
    axis_direction: Vector,
    target_material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    axis = axis_direction.normalized()
    basis_x = Vector((1.0, 0.0, 0.0))
    basis_x = (basis_x - axis * basis_x.dot(axis)).normalized()
    basis_up = basis_x.cross(axis).normalized()
    start_t, end_t = 287.0, 407.0
    outer_radius, inner_radius = 78.0, 70.0
    segments = 16
    vertices: list[tuple[float, float, float]] = []
    for t in (start_t, end_t):
        center = axis_origin + axis * t
        for radius in (outer_radius, inner_radius):
            for index in range(segments + 1):
                angle = math.pi * index / segments
                point = center + basis_x * (math.cos(angle) * radius) + basis_up * (math.sin(angle) * radius)
                vertices.append(tuple(point))

    ring = segments + 1

    def index(end: int, layer: int, segment: int) -> int:
        return end * ring * 2 + layer * ring + segment

    faces: list[tuple[int, ...]] = []
    for segment in range(segments):
        faces.append((index(0, 0, segment), index(0, 0, segment + 1), index(1, 0, segment + 1), index(1, 0, segment)))
        faces.append((index(1, 1, segment), index(1, 1, segment + 1), index(0, 1, segment + 1), index(0, 1, segment)))
        faces.append((index(0, 1, segment), index(0, 1, segment + 1), index(0, 0, segment + 1), index(0, 0, segment)))
        faces.append((index(1, 0, segment), index(1, 0, segment + 1), index(1, 1, segment + 1), index(1, 1, segment)))
    faces.append((index(0, 0, 0), index(1, 0, 0), index(1, 1, 0), index(0, 1, 0)))
    faces.append((index(0, 1, segments), index(1, 1, segments), index(1, 0, segments), index(0, 0, segments)))

    mesh = bpy.data.meshes.new("coupling_guard_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    shell = bpy.data.objects.new("coupling_guard", mesh)
    collection.objects.link(shell)
    apply_material(shell, target_material)

    center_t = (start_t + end_t) * 0.5
    center = axis_origin + axis * center_t
    left = add_cube("__guard_leg_left", Vector((center.x - outer_radius + 4.0, center.y, -91.0)), (8.0, end_t - start_t, 182.0), target_material, collection)
    right = add_cube("__guard_leg_right", Vector((center.x + outer_radius - 4.0, center.y, -91.0)), (8.0, end_t - start_t, 182.0), target_material, collection)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (shell, left, right):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.join()
    shell = bpy.context.object
    shell.name = "coupling_guard"
    shell.data.name = "coupling_guard_mesh"
    previous_cursor = bpy.context.scene.cursor.location.copy()
    bpy.context.scene.cursor.location = center
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR", center="MEDIAN")
    bpy.context.scene.cursor.location = previous_cursor
    shell["semantic_model"] = True
    shell["manufacturer_exact"] = False
    shell["purpose"] = "digital_twin_visualization"
    shell["display_name_zh"] = "联轴器防护罩（简化）"
    shell["supports_visibility_toggle"] = True
    shell["supports_transparency"] = True
    shell["diagnostic_default_visible"] = False
    return shell


def apply_object_transforms(names: Iterable[str]) -> None:
    for name in names:
        obj = bpy.data.objects[name]
        if obj.type != "MESH":
            continue
        world_before = obj.matrix_world.copy()
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        if any(abs(world_before[row][3] - obj.matrix_world[row][3]) > 1e-6 for row in range(3)):
            raise RuntimeError(f"应用变换后{name}世界位置发生变化")


def formalize_scene() -> dict[str, Any]:
    for name in ORIGINAL_NAMES + DRIVE_NAMES + LOCATOR_NAMES + ["casing_group", "impeller_group"]:
        if bpy.data.objects.get(name) is None:
            raise RuntimeError(f"预览Blend缺少对象: {name}")
    axis_origin = Vector(bpy.context.scene.get("rotation_axis_origin", (0.0, 7.3339, -0.000008)))
    axis_direction = Vector(bpy.context.scene.get("rotation_axis_direction", (0.0, 1.0, 0.0))).normalized()
    root = create_root_node(axis_origin, axis_direction)

    mat_guard = material("MAT_GUARD", (0.13, 0.21, 0.26), metallic=0.45, roughness=0.4, alpha=0.58)
    mat_locator = material("MAT_LOCATOR", (0.18, 0.62, 0.58), metallic=0.0, roughness=0.32, alpha=0.12)
    for name in LOCATOR_NAMES:
        apply_material(bpy.data.objects[name], mat_locator)
        bpy.data.objects[name].hide_render = False

    guard_collection = bpy.data.collections.get("ADDED_DRIVE_SYSTEM") or find_root_collection()
    guard = create_guard_shell(axis_origin, axis_direction, mat_guard, guard_collection)

    casing_group = bpy.data.objects["casing_group"]
    casing_group["supports_transparency"] = True
    casing_group["supports_visibility_toggle"] = True
    casing_group["semantic_model"] = True
    casing_group["manufacturer_exact"] = False
    impeller_group = bpy.data.objects["impeller_group"]
    impeller_group["fault_type"] = "impeller_imbalance"
    impeller_group["semantic_model"] = True
    impeller_group["manufacturer_exact"] = False
    impeller_group["purpose"] = "digital_twin_visualization"

    for name in ("coupling_input", "coupling_element", "coupling_output"):
        obj = bpy.data.objects[name]
        obj["semantic_model"] = True
        obj["manufacturer_exact"] = False
        obj["purpose"] = "digital_twin_visualization"
        obj["fault_type"] = "coupling_misalignment"

    locator_specs = {
        "bearing_drive_locator": "驱动端轴承",
        "bearing_non_drive_locator": "非驱动端轴承",
    }
    for name, display_name in locator_specs.items():
        obj = bpy.data.objects[name]
        obj["semantic_locator"] = True
        obj["physical_geometry"] = False
        obj["fault_type"] = "bearing_overheat"
        obj["display_name_zh"] = display_name

    for name in DRIVE_NAMES:
        obj = bpy.data.objects[name]
        obj["semantic_model"] = True
        obj["manufacturer_exact"] = False
        obj["purpose"] = "digital_twin_visualization"

    top_level_names = ORIGINAL_NAMES + DRIVE_NAMES + LOCATOR_NAMES + ["casing_group", "impeller_group", "coupling_guard"]
    for name in top_level_names:
        obj = bpy.data.objects[name]
        if obj.parent is None:
            preserve_parent(obj, root)
    apply_object_transforms(DRIVE_NAMES + LOCATOR_NAMES + ["coupling_guard"])

    # 故障颜色只用于运行时或离线验证，不保留在正式节点材质槽中。
    assigned = {material_slot.material.name for obj in bpy.data.objects if obj.type == "MESH" for material_slot in obj.material_slots if material_slot.material}
    for name in ("MAT_FAULT_ORANGE", "MAT_FAULT_RED", "MAT_CASING_TRANSPARENT"):
        old = bpy.data.materials.get(name)
        if old and name not in assigned:
            bpy.data.materials.remove(old)

    physical = [bpy.data.objects[name] for name in ORIGINAL_NAMES + DRIVE_NAMES + ["coupling_guard"]]
    minimum, maximum, center, radius = bounds(physical)
    base = bpy.data.objects["drive_base"]
    base_min, base_max, _, _ = bounds([base])
    contact = {}
    for name in ("motor", "bearing_drive_housing", "bearing_non_drive_housing", "coupling_guard"):
        component_min, component_max, _, _ = bounds([bpy.data.objects[name]])
        contact[name] = {
            "componentBottomZ": round(component_min.z, 6),
            "baseTopZ": round(base_max.z, 6),
            "verticalGap": round(component_min.z - base_max.z, 6),
            "touchesBaseWithinTolerance": abs(component_min.z - base_max.z) <= 1.0,
        }

    return {
        "axisOrigin": vec(axis_origin),
        "axisDirection": vec(axis_direction),
        "root": root,
        "guard": guard,
        "bounds": {"min": vec(minimum), "max": vec(maximum), "center": vec(center), "radius": round(radius, 6)},
        "contact": contact,
    }


def descendants(root: bpy.types.Object) -> list[bpy.types.Object]:
    result: list[bpy.types.Object] = []
    stack = list(root.children)
    while stack:
        obj = stack.pop()
        result.append(obj)
        stack.extend(obj.children)
    return result


def export_glb(root: bpy.types.Object) -> dict[str, Any]:
    bpy.ops.object.select_all(action="DESELECT")
    export_objects = [root] + descendants(root)
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    result = bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_GLB),
        check_existing=False,
        export_format="GLB",
        export_cameras=False,
        export_lights=False,
        use_selection=True,
        use_visible=False,
        use_renderable=False,
        export_extras=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False,
        export_use_gltfpack=False,
        export_materials="EXPORT",
        export_unused_images=False,
        export_hierarchy_flatten_objs=False,
        export_hierarchy_full_collections=False,
    )
    if "FINISHED" not in result or not OUTPUT_GLB.exists():
        raise RuntimeError(f"GLB导出失败: {result}")
    return {
        "format": "GLB",
        "draco": False,
        "meshopt": False,
        "gltfpack": False,
        "extras": True,
        "animations": False,
        "selectedObjectCount": len(export_objects),
    }


def read_glb_json(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        header = handle.read(12)
        magic, version, total_length = struct.unpack("<4sII", header)
        if magic != b"glTF" or version != 2:
            raise RuntimeError("导出文件不是有效的glTF 2.0 GLB")
        chunk_length, chunk_type = struct.unpack("<II", handle.read(8))
        if chunk_type != 0x4E4F534A:
            raise RuntimeError("GLB首个Chunk不是JSON")
        document = json.loads(handle.read(chunk_length).decode("utf-8").rstrip(" \t\r\n\x00"))
    document["_glbHeader"] = {"version": version, "totalLength": total_length}
    return document


def clean_for_reimport() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def custom_properties(obj: bpy.types.Object) -> dict[str, Any]:
    def convert(value: Any) -> Any:
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        try:
            return [convert(item) for item in value]
        except TypeError:
            return str(value)

    return {key: convert(value) for key, value in obj.items() if key != "_RNA_UI"}


def bvh(obj: bpy.types.Object) -> BVHTree:
    obj.data.calc_loop_triangles()
    vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    triangles = [tuple(triangle.vertices) for triangle in obj.data.loop_triangles]
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True, epsilon=0.0001)


def imported_validation(pre_export: dict[str, Any], glb_document: dict[str, Any]) -> dict[str, Any]:
    bpy.ops.import_scene.gltf(filepath=str(OUTPUT_GLB))
    objects = list(bpy.context.scene.objects)
    by_name = {obj.name: obj for obj in objects}
    missing_nodes = [name for name in KEY_NODES if name not in by_name]
    duplicate_names = sorted({name for name in [obj.name for obj in objects] if [item.name for item in objects].count(name) > 1})
    missing_materials = [name for name in REQUIRED_MATERIALS if bpy.data.materials.get(name) is None]
    axis_origin = Vector(pre_export["axisOrigin"])
    axis_direction = Vector(pre_export["axisDirection"]).normalized()
    axis_distances = {
        name: round(distance_to_axis(by_name[name].matrix_world.translation, axis_origin, axis_direction), 8)
        for name in AXIS_NAMES if name in by_name
    }
    impeller_distances = {
        name: round(distance_to_axis(by_name[name].matrix_world.translation, axis_origin, axis_direction), 8)
        for name in IMPELLER_NAMES if name in by_name
    }
    imported_meshes = [obj for obj in objects if obj.type == "MESH"]
    imported_physical_meshes = [by_name[name] for name in ORIGINAL_NAMES + DRIVE_NAMES + ["coupling_guard"]]
    imported_bounds = bounds(imported_physical_meshes)
    pre_min = Vector(pre_export["bounds"]["min"])
    pre_max = Vector(pre_export["bounds"]["max"])
    bounds_delta = max(
        max(abs(imported_bounds[0][index] - pre_min[index]) for index in range(3)),
        max(abs(imported_bounds[1][index] - pre_max[index]) for index in range(3)),
    )
    total_triangles = sum(mesh_triangles(obj) for obj in imported_meshes)
    original_triangles = sum(mesh_triangles(by_name[name]) for name in ORIGINAL_NAMES if name in by_name)
    added_triangles = total_triangles - original_triangles

    root = by_name.get("Fan_Digital_Twin")
    hierarchy_checks = {
        "casingGroupUnderRoot": by_name.get("casing_group") is not None and by_name["casing_group"].parent == root,
        "impellerGroupUnderRoot": by_name.get("impeller_group") is not None and by_name["impeller_group"].parent == root,
        "casingChildren": {name: by_name[name].parent.name if name in by_name and by_name[name].parent else None for name in CASING_NAMES},
        "impellerChildren": {name: by_name[name].parent.name if name in by_name and by_name[name].parent else None for name in IMPELLER_NAMES},
    }

    expected_properties = {
        "bearing_drive_locator": {
            "semantic_locator": True,
            "physical_geometry": False,
            "fault_type": "bearing_overheat",
            "display_name_zh": "驱动端轴承",
        },
        "bearing_non_drive_locator": {
            "semantic_locator": True,
            "physical_geometry": False,
            "fault_type": "bearing_overheat",
            "display_name_zh": "非驱动端轴承",
        },
        "impeller_group": {"fault_type": "impeller_imbalance"},
        "casing_group": {"supports_transparency": True, "supports_visibility_toggle": True},
        "coupling_input": {"fault_type": "coupling_misalignment", "semantic_model": True, "manufacturer_exact": False},
        "coupling_element": {"fault_type": "coupling_misalignment", "semantic_model": True, "manufacturer_exact": False},
        "coupling_output": {"fault_type": "coupling_misalignment", "semantic_model": True, "manufacturer_exact": False},
        "coupling_guard": {"supports_visibility_toggle": True, "supports_transparency": True},
    }
    property_checks: dict[str, Any] = {}
    for name, expected in expected_properties.items():
        actual = custom_properties(by_name[name]) if name in by_name else {}
        property_checks[name] = {
            "expected": expected,
            "actual": actual,
            "preserved": all(actual.get(key) == value for key, value in expected.items()),
        }

    casing_intersections = []
    if not missing_nodes:
        casing_bvhs = {name: bvh(by_name[name]) for name in CASING_NAMES}
        for name in DRIVE_NAMES + ["coupling_guard"]:
            current_bvh = bvh(by_name[name])
            for casing_name, casing_tree in casing_bvhs.items():
                overlap = len(current_bvh.overlap(casing_tree))
                if overlap:
                    casing_intersections.append({"object": name, "casing": casing_name, "trianglePairs": overlap})

    base_contact = {}
    if "drive_base" in by_name:
        _, base_max, _, _ = bounds([by_name["drive_base"]])
        for name in ("motor", "bearing_drive_housing", "bearing_non_drive_housing", "coupling_guard"):
            component_min, _, _, _ = bounds([by_name[name]])
            gap = component_min.z - base_max.z
            base_contact[name] = {
                "verticalGap": round(gap, 6),
                "touchesBaseWithinTolerance": abs(gap) <= 1.0,
            }

    extensions = glb_document.get("extensionsUsed", [])
    draco_used = "KHR_draco_mesh_compression" in extensions or any(
        "KHR_draco_mesh_compression" in primitive.get("extensions", {})
        for mesh in glb_document.get("meshes", [])
        for primitive in mesh.get("primitives", [])
    )
    normal_materials = {
        name: [slot.material.name for slot in by_name[name].material_slots if slot.material]
        for name in (CASING_NAMES + IMPELLER_NAMES + DRIVE_NAMES + ["coupling_guard"])
    }
    forbidden_fault_assignment = {
        name: materials
        for name, materials in normal_materials.items()
        if any(material_name.startswith("MAT_FAULT_") for material_name in materials)
    }

    failures: list[str] = []
    if missing_nodes:
        failures.append("missingNodes")
    if duplicate_names:
        failures.append("duplicateNames")
    if missing_materials:
        failures.append("missingMaterials")
    if bounds_delta > 0.01:
        failures.append("boundsChanged")
    if axis_distances and max(axis_distances.values()) > 0.001:
        failures.append("axisAlignment")
    if impeller_distances and max(impeller_distances.values()) > 0.001:
        failures.append("impellerOrigin")
    if casing_intersections:
        failures.append("unexpectedCasingIntersection")
    if not all(item["touchesBaseWithinTolerance"] for item in base_contact.values()):
        failures.append("baseContact")
    if not all(item["preserved"] for item in property_checks.values()):
        failures.append("customProperties")
    if draco_used:
        failures.append("dracoUnexpectedlyEnabled")
    if forbidden_fault_assignment:
        failures.append("faultMaterialAssigned")

    return {
        "importSucceeded": True,
        "objectCount": len(objects),
        "meshCount": len(imported_meshes),
        "keyNodeCount": len(KEY_NODES) - len(missing_nodes),
        "requiredKeyNodeCount": len(KEY_NODES),
        "missingNodes": missing_nodes,
        "duplicateNames": duplicate_names,
        "missingMaterials": missing_materials,
        "hierarchy": hierarchy_checks,
        "bounds": {"min": vec(imported_bounds[0]), "max": vec(imported_bounds[1]), "deltaFromPreExport": round(bounds_delta, 8)},
        "triangles": {"original": original_triangles, "added": added_triangles, "total": total_triangles},
        "axisDistances": axis_distances,
        "impellerOriginDistances": impeller_distances,
        "baseContact": base_contact,
        "casingIntersections": casing_intersections,
        "casingCanHideIndependently": "casing_group" in by_name and all(by_name[name].parent == by_name["casing_group"] for name in CASING_NAMES),
        "guardCanHideIndependently": "coupling_guard" in by_name and by_name["coupling_guard"].type == "MESH",
        "customProperties": property_checks,
        "customPropertiesPreserved": all(item["preserved"] for item in property_checks.values()),
        "normalMaterials": normal_materials,
        "faultMaterialsAssignedToNormalModel": forbidden_fault_assignment,
        "normalMaterialsRestorable": not forbidden_fault_assignment,
        "glbExtensionsUsed": extensions,
        "dracoUsed": draco_used,
        "valid": not failures,
        "failures": failures,
    }


def configure_validation_render(center: Vector, radius: float) -> bpy.types.Object:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("ValidationWorld")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background") if scene.world.node_tree else None
    if background:
        background.inputs["Color"].default_value = (0.008, 0.017, 0.027, 1.0)
        background.inputs["Strength"].default_value = 0.48
    helper = bpy.data.collections.new("VALIDATION_PREVIEW_HELPERS")
    scene.collection.children.link(helper)
    camera_data = bpy.data.cameras.new("ValidationCamera")
    camera = bpy.data.objects.new("ValidationCamera", camera_data)
    helper.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.clip_start = max(radius * 0.001, 0.01)
    camera_data.clip_end = radius * 15.0
    scene.camera = camera
    for name, direction, energy in (
        ("ValidationKey", (1.8, -1.3, 2.3), 2.8),
        ("ValidationFill", (-1.5, -0.4, 1.0), 1.25),
        ("ValidationRim", (0.3, 2.0, 1.8), 2.0),
    ):
        data = bpy.data.lights.new(name, type="SUN")
        data.energy = energy
        data.angle = math.radians(10.0)
        light = bpy.data.objects.new(name, data)
        helper.objects.link(light)
        vector = Vector(direction).normalized()
        light.location = center + vector * radius * 3.0
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
    return camera


def position_camera(camera: bpy.types.Object, center: Vector, radius: float, direction: tuple[float, float, float], scale: float = 2.25) -> None:
    view = Vector(direction).normalized()
    camera.location = center + view * radius * 3.2
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = radius * scale
    camera.data.clip_start = max(radius * 0.001, 0.01)
    camera.data.clip_end = radius * 15.0
    bpy.context.view_layer.update()


def render(path: Path) -> None:
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def snapshot_materials(objects: Iterable[bpy.types.Object]) -> dict[str, tuple[list[bpy.types.Material | None], list[int]]]:
    return {
        obj.name: (list(obj.data.materials), [polygon.material_index for polygon in obj.data.polygons])
        for obj in objects if obj.type == "MESH"
    }


def restore_materials(objects: dict[str, bpy.types.Object], snapshot: dict[str, tuple[list[bpy.types.Material | None], list[int]]]) -> None:
    for name, (materials, indices) in snapshot.items():
        obj = objects[name]
        obj.data.materials.clear()
        for item in materials:
            obj.data.materials.append(item)
        for polygon, material_index in zip(obj.data.polygons, indices):
            polygon.material_index = material_index


def set_visible(meshes: Iterable[bpy.types.Object], visible: set[str]) -> None:
    for obj in meshes:
        obj.hide_render = obj.name not in visible


def render_validation_previews(validation: dict[str, Any]) -> bool:
    by_name = {obj.name: obj for obj in bpy.context.scene.objects}
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    exported_names = {obj.name for obj in meshes}
    locator_set = set(LOCATOR_NAMES)
    normal_visible = exported_names - locator_set
    full_bounds = bounds([obj for obj in meshes if obj.name not in locator_set])
    _, _, full_center, full_radius = full_bounds
    drive_focus = [by_name[name] for name in IMPELLER_NAMES + DRIVE_NAMES + ["coupling_guard"]]
    _, _, drive_center, drive_radius = bounds(drive_focus)
    camera = configure_validation_render(full_center, full_radius)
    material_state = snapshot_materials(meshes)
    normal_material_names = {name: [material.name for material in materials if material] for name, (materials, _) in material_state.items()}
    temp_transparent = material("__VALIDATE_TRANSPARENT", (0.12, 0.21, 0.28), metallic=0.15, roughness=0.4, alpha=0.16)
    temp_orange = material("__VALIDATE_ORANGE", (1.0, 0.27, 0.02), metallic=0.05, roughness=0.25, emission=(1.0, 0.09, 0.0), emission_strength=2.4)
    temp_red = material("__VALIDATE_RED", (0.95, 0.02, 0.03), metallic=0.0, roughness=0.23, emission=(1.0, 0.0, 0.0), emission_strength=2.8)
    palette = [
        (0.14, 0.72, 0.64), (0.18, 0.48, 0.86), (0.94, 0.52, 0.12), (0.74, 0.36, 0.82),
        (0.84, 0.25, 0.3), (0.3, 0.65, 0.9), (0.6, 0.72, 0.2), (0.9, 0.74, 0.22),
    ]
    palette_materials = [material(f"__VALIDATE_NODE_{index:02d}", color, metallic=0.15, roughness=0.38) for index, color in enumerate(palette)]
    iso = (1.45, -1.75, 1.1)
    close = (1.8, 0.35, 0.9)

    set_visible(meshes, normal_visible)
    position_camera(camera, full_center, full_radius, iso)
    render(PREVIEW_DIR / "01_full_normal.png")

    set_visible(meshes, normal_visible)
    position_camera(camera, drive_center, drive_radius, close, 2.15)
    render(PREVIEW_DIR / "02_coupling_guard_visible.png")

    set_visible(meshes, normal_visible - {"coupling_guard"})
    position_camera(camera, drive_center, drive_radius, close, 2.15)
    render(PREVIEW_DIR / "03_coupling_guard_hidden.png")

    restore_materials(by_name, material_state)
    for name in CASING_NAMES:
        apply_material(by_name[name], temp_transparent)
    set_visible(meshes, normal_visible)
    position_camera(camera, full_center, full_radius, iso)
    render(PREVIEW_DIR / "04_casing_transparent.png")

    restore_materials(by_name, material_state)
    for name in CASING_NAMES:
        apply_material(by_name[name], temp_transparent)
    for name in IMPELLER_NAMES:
        apply_material(by_name[name], temp_orange)
    set_visible(meshes, normal_visible - {"coupling_guard"})
    position_camera(camera, full_center, full_radius, iso)
    render(PREVIEW_DIR / "05_impeller_highlight.png")

    restore_materials(by_name, material_state)
    for name in CASING_NAMES:
        apply_material(by_name[name], temp_transparent)
    apply_material(by_name["bearing_drive_housing"], temp_red)
    apply_material(by_name["bearing_drive_locator"], temp_red)
    set_visible(meshes, (normal_visible - {"coupling_guard"}) | {"bearing_drive_locator"})
    position_camera(camera, drive_center, drive_radius, close, 2.15)
    render(PREVIEW_DIR / "06_drive_bearing_highlight.png")

    restore_materials(by_name, material_state)
    for name in CASING_NAMES:
        apply_material(by_name[name], temp_transparent)
    for name in ("main_shaft", "motor_shaft", "coupling_input", "coupling_element", "coupling_output"):
        apply_material(by_name[name], temp_orange)
    set_visible(meshes, normal_visible - {"coupling_guard"})
    position_camera(camera, drive_center, drive_radius, close, 2.15)
    render(PREVIEW_DIR / "07_coupling_shaft_highlight.png")

    restore_materials(by_name, material_state)
    for index, obj in enumerate(sorted(meshes, key=lambda item: item.name)):
        apply_material(obj, palette_materials[index % len(palette_materials)])
    set_visible(meshes, exported_names - {"rotation_axis"})
    position_camera(camera, full_center, full_radius, iso)
    render(PREVIEW_DIR / "08_all_nodes_colored.png")

    restore_materials(by_name, material_state)
    for name in CASING_NAMES:
        apply_material(by_name[name], temp_transparent)
    for name in ("main_shaft", "motor_shaft", "coupling_input", "coupling_element", "coupling_output"):
        apply_material(by_name[name], temp_orange)
    apply_material(by_name["rotation_axis"], temp_red)
    set_visible(meshes, normal_visible | {"rotation_axis"})
    position_camera(camera, full_center, full_radius, (1.0, -1.7, 0.65))
    render(PREVIEW_DIR / "09_rotation_axis_validation.png")

    restore_materials(by_name, material_state)
    set_visible(meshes, normal_visible)
    position_camera(camera, full_center, full_radius, (-1.45, -1.55, 1.0))
    render(PREVIEW_DIR / "10_reimported_full_model.png")
    restore_materials(by_name, material_state)

    restored_material_names = {
        name: [slot.material.name for slot in by_name[name].material_slots if slot.material]
        for name in normal_material_names
    }
    return restored_material_names == normal_material_names


def write_reports(export_settings: dict[str, Any], validation: dict[str, Any], glb_document: dict[str, Any], pre_export: dict[str, Any], materials_restored: bool) -> None:
    by_name = {obj.name: obj for obj in bpy.context.scene.objects}
    node_mapping = {
        "version": "enhanced-v1",
        "root": "Fan_Digital_Twin",
        "keyNodeCount": len(KEY_NODES),
        "keyNodes": {
            name: {
                "exists": name in by_name,
                "type": by_name[name].type if name in by_name else None,
                "parent": by_name[name].parent.name if name in by_name and by_name[name].parent else None,
                "children": [child.name for child in by_name[name].children] if name in by_name else [],
                "materials": [slot.material.name for slot in by_name[name].material_slots if slot.material] if name in by_name and by_name[name].type == "MESH" else [],
                "customProperties": custom_properties(by_name[name]) if name in by_name else {},
            }
            for name in KEY_NODES
        },
        "threeJsLookup": {name: f'scene.getObjectByName("{name}")' for name in KEY_NODES},
        "validation": {
            "allKeyNodesPresent": not validation["missingNodes"],
            "uniqueNames": not validation["duplicateNames"],
            "customPropertiesPreserved": validation["customPropertiesPreserved"],
        },
    }
    (REPORT_DIR / "enhanced-v1-node-mapping.json").write_text(json.dumps(node_mapping, ensure_ascii=False, indent=2), encoding="utf-8")
    (REPORT_DIR / "enhanced-v1-validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding="utf-8")

    size_bytes = OUTPUT_GLB.stat().st_size
    triangle_counts = validation["triangles"]
    export_report = "\n".join([
        "# 引风机增强版 v1 GLB 导出报告",
        "",
        "> 本文件用于离线网站接入验证，尚未替换网站当前模型。",
        "",
        f"- 来源Blend：`{SOURCE_BLEND}`",
        f"- 正式Blend：`{OUTPUT_BLEND}`",
        f"- 正式GLB：`{OUTPUT_GLB}`",
        f"- 文件大小：{size_bytes:,} bytes（{size_bytes / 1024 / 1024:.2f} MiB）",
        f"- 原始三角面：{triangle_counts['original']:,}",
        f"- 新增三角面：{triangle_counts['added']:,}",
        f"- 总三角面：{triangle_counts['total']:,}",
        f"- 关键节点：{validation['keyNodeCount']}/{validation['requiredKeyNodeCount']}",
        f"- Draco：{'已启用' if validation['dracoUsed'] else '未启用'}",
        f"- glTF extras：{'已启用' if export_settings['extras'] else '未启用'}",
        f"- 故障高亮材质永久分配：{'是' if validation['faultMaterialsAssignedToNormalModel'] else '否'}",
        f"- 临时高亮后正常材质恢复：{'通过' if materials_restored else '失败'}",
        "",
        "## 导出结构",
        "",
        "- 新增可导出的根节点 `Fan_Digital_Twin`。",
        "- `casing_group` 与 `impeller_group` 保留原始子对象和装配位置。",
        "- `coupling_guard` 为独立、低面数、半透明且可隐藏的语义防护罩。",
        "- 轴承定位节点通过 glTF extras 保留语义属性。",
        "- 正常GLB未永久分配故障高亮材质。",
        "",
        "## 安全边界",
        "",
        "- 未覆盖网站当前 `induced-draft-fan.glb`。",
        "- 未删除或移动无法确认的原始几何。",
        "- 未修改网站、飞书、工单或API代码。",
        "- 未执行部署。",
    ])
    (REPORT_DIR / "enhanced-v1-export-report.md").write_text(export_report, encoding="utf-8")

    checks = [
        ("GLB可正常重新导入", validation["importSucceeded"]),
        ("16个关键节点全部存在", not validation["missingNodes"]),
        ("节点名称唯一", not validation["duplicateNames"]),
        ("关键材质存在", not validation["missingMaterials"]),
        ("导出前后包围盒一致", validation["bounds"]["deltaFromPreExport"] <= 0.01),
        ("叶轮原点位于旋转轴线", max(validation["impellerOriginDistances"].values()) <= 0.001),
        ("传动部件保持共轴", max(validation["axisDistances"].values()) <= 0.001),
        ("电机、轴承座和防护罩与底座接触", all(item["touchesBaseWithinTolerance"] for item in validation["baseContact"].values())),
        ("未发现传动系统与原机壳非预期穿模", not validation["casingIntersections"]),
        ("机壳可独立隐藏", validation["casingCanHideIndependently"]),
        ("联轴器防护罩可独立隐藏", validation["guardCanHideIndependently"]),
        ("自定义语义属性保留", validation["customPropertiesPreserved"]),
        ("未使用Draco", not validation["dracoUsed"]),
        ("正常材质可完整恢复", materials_restored),
    ]
    validation_markdown = "\n".join([
        "# 引风机增强版 v1 重新导入验证",
        "",
        *[f"- [{'x' if passed else ' '}] {label}" for label, passed in checks],
        "",
        f"- 验证结论：{'通过' if validation['valid'] and materials_restored else '失败'}",
        f"- 失败项：{validation['failures'] if validation['failures'] else '无'}",
        f"- GLB扩展：{validation['glbExtensionsUsed'] if validation['glbExtensionsUsed'] else '无'}",
        f"- 总三角面：{triangle_counts['total']:,}",
        f"- 文件大小：{size_bytes:,} bytes",
        "",
        "只有本验证通过后，该GLB才适合进入网站测试接入阶段；本轮没有替换网站模型。",
    ])
    (REPORT_DIR / "enhanced-v1-validation.md").write_text(validation_markdown, encoding="utf-8")


def main() -> None:
    if Path(bpy.data.filepath).resolve() != SOURCE_BLEND.resolve():
        raise RuntimeError(f"必须从指定预览Blend运行，当前为: {bpy.data.filepath}")
    pre_export = formalize_scene()
    original_triangles = sum(mesh_triangles(bpy.data.objects[name]) for name in ORIGINAL_NAMES)
    pre_export["originalTriangles"] = original_triangles
    pre_export["totalTriangles"] = sum(mesh_triangles(obj) for obj in descendants(pre_export["root"]) if obj.type == "MESH")
    bpy.context.scene["formal_glb_exported"] = True
    bpy.context.scene["model_version"] = "enhanced-v1"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND), check_existing=False)
    export_settings = export_glb(pre_export["root"])
    glb_document = read_glb_json(OUTPUT_GLB)

    clean_for_reimport()
    validation = imported_validation(pre_export, glb_document)
    materials_restored = render_validation_previews(validation)
    if not materials_restored:
        validation["valid"] = False
        validation["failures"].append("normalMaterialRestore")
    write_reports(export_settings, validation, glb_document, pre_export, materials_restored)
    if not validation["valid"]:
        raise RuntimeError(f"重新导入验证失败: {validation['failures']}")
    print(json.dumps({
        "status": "complete",
        "outputBlend": str(OUTPUT_BLEND),
        "outputGlb": str(OUTPUT_GLB),
        "fileSizeBytes": OUTPUT_GLB.stat().st_size,
        "triangles": validation["triangles"],
        "keyNodes": f"{validation['keyNodeCount']}/{validation['requiredKeyNodeCount']}",
        "axisMaxDistance": max(validation["axisDistances"].values()),
        "impellerOriginMaxDistance": max(validation["impellerOriginDistances"].values()),
        "customPropertiesPreserved": validation["customPropertiesPreserved"],
        "unintendedCasingIntersections": validation["casingIntersections"],
        "dracoUsed": validation["dracoUsed"],
        "materialsRestored": materials_restored,
        "validation": validation["valid"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ENHANCED_V1_EXPORT_ERROR: {exc}", file=sys.stderr)
        raise
