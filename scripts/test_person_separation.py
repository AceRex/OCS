"""
test_person_separation.py
==========================
Prototype and benchmark Person Instance Detection & Separation for Creatorverse flyer.
"""

import os
import time
import cv2
import numpy as np
from PIL import Image

def test_detection():
    img_path = 'fixtures/creatorverse_flyer.jpg'
    img = cv2.imread(img_path)
    orig_h, orig_w, _ = img.shape
    print(f"Original image: {orig_w}x{orig_h}")

    t0 = time.time()
    # 1. Run YuNet Face Detection
    detector = cv2.FaceDetectorYN.create(
        'ocs_image_engine/models/person/face_detection_yunet.onnx',
        '',
        (orig_w, orig_h),
        score_threshold=0.45,
        nms_threshold=0.3
    )
    _, faces = detector.detect(img)
    t_face = (time.time() - t0) * 1000
    print(f"YuNet face detection: {len(faces)} faces detected in {t_face:.1f}ms")

    # Group faces by rows (Y-coordinate clustering)
    # Row 1 (Speakers): Y ~ 330-350
    # Row 2 (Panelists): Y ~ 590-610
    face_list = []
    for f in faces:
        fx, fy, fw, fh = int(f[0]), int(f[1]), int(f[2]), int(f[3])
        score = float(f[-1])
        face_list.append({
            'x': fx, 'y': fy, 'w': fw, 'h': fh,
            'cx': fx + fw // 2, 'cy': fy + fh // 2,
            'score': score
        })

    # Sort primarily by Y (to identify rows), then by X (left to right)
    # Group into rows based on cy proximity (within 80px)
    face_list.sort(key=lambda f: f['cy'])
    rows = []
    for f in face_list:
        placed = False
        for r in rows:
            if abs(r['avg_cy'] - f['cy']) < 80:
                r['faces'].append(f)
                r['avg_cy'] = sum(x['cy'] for x in r['faces']) / len(r['faces'])
                placed = True
                break
        if not placed:
            rows.append({'avg_cy': f['cy'], 'faces': [f]})

    print(f"Found {len(rows)} distinct people rows/groups:")
    for i, r in enumerate(rows):
        r['faces'].sort(key=lambda f: f['cx'])
        print(f"  Row {i+1} (avg Y={r['avg_cy']:.0f}): {len(r['faces'])} people")

    # Step 2: Compute Person Instance Bounding Boxes
    # For each face in a row:
    # - Top: extends up to cover hair/headwear (fy - 0.4 * fh)
    # - Bottom: extends down through torso/arms.
    #   For row 1: torso extends to ~ y=530px (bottom of speaker card).
    #   For row 2: torso extends to ~ y=745px (bottom of panelist row).
    # - Left & Right:
    #   Bounded by half-distance to adjacent neighboring faces, or 1.5 * fw padding.
    os.makedirs('scratch/person_test_extractions', exist_ok=True)
    person_instances = []

    for row_idx, r in enumerate(rows):
        faces_in_row = r['faces']
        row_name = "Speakers" if row_idx == 0 else "Panelists"
        # Determine bottom limit for this row
        if row_idx == 0:
            row_bottom = min(orig_h, int(r['avg_cy'] + 195))
        else:
            row_bottom = min(orig_h, int(r['avg_cy'] + 155))

        for p_idx, f in enumerate(faces_in_row):
            cx, cy = f['cx'], f['cy']
            fw, fh = f['w'], f['h']

            # Top of head
            top = max(0, int(f['y'] - fh * 0.45))
            bottom = row_bottom

            # Left and Right boundaries with neighbor partition
            if p_idx == 0:
                # First person in row
                right_neighbor = faces_in_row[1]['cx'] if len(faces_in_row) > 1 else cx + fw * 3
                max_w_half = (right_neighbor - cx) / 2
                left = max(0, int(cx - max_w_half * 0.95))
                right = min(orig_w, int(cx + max_w_half))
            elif p_idx == len(faces_in_row) - 1:
                # Last person in row
                left_neighbor = faces_in_row[p_idx - 1]['cx']
                max_w_half = (cx - left_neighbor) / 2
                left = max(0, int(cx - max_w_half))
                right = min(orig_w, int(cx + max_w_half * 0.95))
            else:
                # Middle person
                left_neighbor = faces_in_row[p_idx - 1]['cx']
                right_neighbor = faces_in_row[p_idx + 1]['cx']
                left = max(0, int(cx - (cx - left_neighbor) / 2))
                right = min(orig_w, int(cx + (right_neighbor - cx) / 2))

            pw = right - left
            ph = bottom - top

            person_id = f"{row_name.lower()}_person_{p_idx + 1}"
            label = f"{row_name[:-1]} Person {p_idx + 1}"

            person_instances.append({
                'id': person_id,
                'label': label,
                'group': row_name,
                'box': (left, top, pw, ph),
                'face': f
            })

            # Step 3: Test Person Segmentation Mask (GrabCut / Alpha extraction)
            person_crop = img[top:bottom, left:right]
            crop_h, crop_w, _ = person_crop.shape

            # Run GrabCut initialization:
            # Mask initialized with PR_BGD (2), with face center as definite foreground (1)
            # and border edges as definite background (0)
            mask = np.full((crop_h, crop_w), cv2.GC_PR_BGD, dtype=np.uint8)
            # Definite background at outer left/right if not center
            mask[:, 0:2] = cv2.GC_BGD
            mask[:, crop_w-2:crop_w] = cv2.GC_BGD

            # Definite foreground in face area
            rel_fx = max(0, f['x'] - left)
            rel_fy = max(0, f['y'] - top)
            rel_fw = min(crop_w - rel_fx, f['w'])
            rel_fh = min(crop_h - rel_fy, f['h'])
            # Center of face
            mask[rel_fy + 5 : rel_fy + rel_fh - 5, rel_fx + 5 : rel_fx + rel_fw - 5] = cv2.GC_FGD
            # Probable foreground for torso (below face)
            torso_top = rel_fy + rel_fh
            torso_bot = crop_h - 5
            torso_left = max(0, rel_fx - int(rel_fw * 0.3))
            torso_right = min(crop_w, rel_fx + int(rel_fw * 1.3))
            mask[torso_top:torso_bot, torso_left:torso_right] = cv2.GC_PR_FGD

            bgdModel = np.zeros((1, 65), np.float64)
            fgdModel = np.zeros((1, 65), np.float64)

            # 2 iterations of GrabCut is very fast (~15ms per person)
            cv2.grabCut(person_crop, mask, None, bgdModel, fgdModel, 2, cv2.GC_INIT_WITH_MASK)
            fg_mask = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

            # Smooth mask with slight Gaussian blur
            fg_mask_blurred = cv2.GaussianBlur(fg_mask, (5, 5), 1.0)

            # Create 4-channel RGBA cutout
            b, g, r_ch = cv2.split(person_crop)
            rgba = cv2.merge([b, g, r_ch, fg_mask_blurred])

            out_path = f"scratch/person_test_extractions/{person_id}.png"
            cv2.imwrite(out_path, rgba)

    print(f"\nGenerated {len(person_instances)} independent person instances:")
    for pi in person_instances:
        b = pi['box']
        print(f"  [{pi['group']}] {pi['label']}: Box=({b[0]}, {b[1]}, {b[2]}x{b[3]}), Face Anchor=({pi['face']['x']}, {pi['face']['y']})")

if __name__ == '__main__':
    test_detection()
