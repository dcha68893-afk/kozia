using System.Collections;
using UnityEngine;

/// Runtime avatar presentation. The prototype uses procedural primitives so it has no art dependency;
/// the motion rig is deliberately separated from Build() so a future skinned-human prefab can replace it.
public class AvatarView : MonoBehaviour
{
    public bool interpolate = true;
    Transform model, leftArm, rightArm, leftLeg, rightLeg;
    TextMesh label;
    Vector3 targetPos;
    float targetRy, motion;
    bool walking;
    Coroutine emote;

    public static Color Hex(string hex, Color fallback = default)
    {
        if (!string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var c)) return c;
        return fallback == default ? Color.gray : fallback;
    }

    public void Build(string displayName, Look look, string stage)
    {
        foreach (Transform c in transform) Destroy(c.gameObject);
        look = look ?? new Look();
        var a = look.appearance ?? new Appearance();
        Color skin = Hex(a.skin), hair = Hex(a.hairColor);
        string top = "#d9d9d9", bottom = "#555555", shoes = "#eeeeee";
        bool crown = false, shades = false, headset = false;

        foreach (var e in look.equipped ?? new System.Collections.Generic.List<EquippedItem>())
        {
            if (e == null) continue;
            switch (e.category)
            {
                case "top": top = e.color ?? top; break;
                case "bottom": bottom = e.color ?? bottom; break;
                case "shoes": shoes = e.color ?? shoes; break;
                case "accessory":
                    crown |= e.id == "acc_crown";
                    shades |= e.id == "acc_sunglasses";
                    headset |= e.id == "acc_headset";
                    break;
            }
        }

        bool skeleton = stage == "skeleton";
        if (skeleton) { skin = Hex("#e8e4d0"); top = "#e8e4d0"; bottom = "#d8d4c0"; shoes = "#d8d4c0"; hair = skin; }
        if (stage == "legendary") top = "#d4af37";
        else if (stage == "elite") hair = Color.Lerp(hair, Hex("#d4af37"), 0.5f);

        float h = Mathf.Clamp(a.height, 0.85f, 1.15f);
        float b = Mathf.Clamp(a.build, 0.8f, 1.25f) * (skeleton ? 0.72f : 1f);

        model = new GameObject("Model").transform;
        model.SetParent(transform, false);
        model.localScale = new Vector3(1, h, 1);

        Part(PrimitiveType.Capsule, new Vector3(0, 1.17f, 0), new Vector3(0.48f * b, 0.46f, 0.30f * b), Hex(top));
        Part(PrimitiveType.Cylinder, new Vector3(0, 0.53f, 0), new Vector3(0.31f * b, 0.48f, 0.31f * b), Hex(bottom));
        Part(PrimitiveType.Cube, new Vector3(0, 0.08f, 0.10f), new Vector3(0.44f * b, 0.10f, 0.62f), Hex(shoes));
        Part(PrimitiveType.Cylinder, new Vector3(0, 1.57f, 0), new Vector3(0.14f, 0.10f, 0.14f), skin);
        Part(PrimitiveType.Sphere, new Vector3(0, 1.86f, 0), Vector3.one * 0.34f, skin);
        leftArm = Part(PrimitiveType.Capsule, new Vector3(-0.43f * b, 1.15f, 0), new Vector3(0.12f, 0.34f, 0.12f), skin);
        rightArm = Part(PrimitiveType.Capsule, new Vector3(0.43f * b, 1.15f, 0), new Vector3(0.12f, 0.34f, 0.12f), skin);
        leftLeg = Part(PrimitiveType.Capsule, new Vector3(-0.16f * b, 0.48f, 0), new Vector3(0.14f, 0.42f, 0.14f), Hex(bottom));
        rightLeg = Part(PrimitiveType.Capsule, new Vector3(0.16f * b, 0.48f, 0), new Vector3(0.14f, 0.42f, 0.14f), Hex(bottom));

        if (!skeleton) Part(PrimitiveType.Sphere, new Vector3(0, 1.86f, 0.30f), new Vector3(0.045f, 0.045f, 0.025f), Hex(a.eyes));
        switch (a.hairStyle)
        {
            case 1: Part(PrimitiveType.Sphere, new Vector3(0, 1.98f, -0.02f), new Vector3(0.36f, 0.22f, 0.36f), hair); break;
            case 2: Part(PrimitiveType.Sphere, new Vector3(0, 2.06f, 0), new Vector3(0.32f, 0.34f, 0.32f), hair); break;
            case 3: Part(PrimitiveType.Sphere, new Vector3(0, 1.94f, -0.02f), new Vector3(0.46f, 0.30f, 0.42f), hair); break;
            case 4: Part(PrimitiveType.Cylinder, new Vector3(0, 2.02f, 0), new Vector3(0.34f, 0.06f, 0.34f), hair); break;
            case 5: Part(PrimitiveType.Capsule, new Vector3(0, 1.76f, -0.14f), new Vector3(0.36f, 0.34f, 0.20f), hair); break;
        }
        if (shades) Part(PrimitiveType.Cube, new Vector3(0, 1.87f, 0.30f), new Vector3(0.30f, 0.06f, 0.05f), Color.black);
        if (headset) Part(PrimitiveType.Cylinder, new Vector3(0, 1.90f, 0), new Vector3(0.40f, 0.015f, 0.04f), Hex("#222222")).Rotate(0, 0, 90);
        if (crown) Part(PrimitiveType.Cylinder, new Vector3(0, 2.15f, 0), new Vector3(0.26f, 0.05f, 0.26f), Hex("#d4af37"));

        var lgo = new GameObject("Label");
        lgo.transform.SetParent(transform, false);
        lgo.transform.localPosition = new Vector3(0, 2.48f * h, 0);
        label = lgo.AddComponent<TextMesh>();
        var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        label.font = font; lgo.GetComponent<MeshRenderer>().material = font.material;
        label.text = displayName; label.characterSize = 0.08f; label.fontSize = 48;
        label.anchor = TextAnchor.MiddleCenter; label.color = Color.white;
        walking = false; motion = 0;
    }

    Transform Part(PrimitiveType type, Vector3 pos, Vector3 scale, Color color)
    {
        var go = GameObject.CreatePrimitive(type);
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(model, false);
        go.transform.localPosition = pos; go.transform.localScale = scale;
        go.GetComponent<Renderer>().material.color = color;
        return go.transform;
    }

    public void Snap(Vector3 pos, float ry)
    {
        transform.position = pos; targetPos = pos;
        transform.rotation = Quaternion.Euler(0, ry, 0); targetRy = ry;
    }

    public void SetTarget(Vector3 pos, float ry) { SetTarget(pos, ry, "walk"); }
    public void SetTarget(Vector3 pos, float ry, string anim)
    {
        targetPos = pos; targetRy = ry; SetServerAnimation(anim);
    }

    public void SetMotion(bool moving, float amount = 1f)
    {
        walking = moving; motion = Mathf.Clamp01(amount);
    }

    public void SetServerAnimation(string anim) { SetMotion(anim == "walk" || anim == "run", anim == "run" ? 1f : 0.65f); }

    void Update()
    {
        if (interpolate)
        {
            transform.position = Vector3.Lerp(transform.position, targetPos, Time.deltaTime * 12f);
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.Euler(0, targetRy, 0), Time.deltaTime * 12f);
        }
        if (model != null && emote == null)
        {
            float cycle = Time.time * Mathf.Lerp(5f, 8f, motion);
            float swing = walking ? Mathf.Sin(cycle) * 24f * motion : 0f;
            float bob = walking ? Mathf.Abs(Mathf.Sin(cycle * 2f)) * 0.035f * motion : 0f;
            leftArm.localRotation = Quaternion.Euler(swing, 0, 0);
            rightArm.localRotation = Quaternion.Euler(-swing, 0, 0);
            leftLeg.localRotation = Quaternion.Euler(-swing, 0, 0);
            rightLeg.localRotation = Quaternion.Euler(swing, 0, 0);
            model.localPosition = new Vector3(0, bob, 0);
        }
    }

    void LateUpdate()
    {
        if (label != null && Camera.main != null) label.transform.rotation = Camera.main.transform.rotation;
    }

    public void PlayEmote(string e)
    {
        if (model == null) return;
        if (emote != null) StopCoroutine(emote);
        emote = StartCoroutine(EmoteRoutine(e));
    }

    IEnumerator EmoteRoutine(string e)
    {
        float dur = e == "dance" ? 2.5f : 1.6f;
        for (float t = 0; t < dur; t += Time.deltaTime)
        {
            float s = t * 8f;
            switch (e)
            {
                case "dance": model.localRotation = Quaternion.Euler(0, t * 360f, Mathf.Sin(s) * 8f); model.localPosition = new Vector3(0, Mathf.Abs(Mathf.Sin(s)) * 0.15f, 0); break;
                case "cheer": model.localPosition = new Vector3(0, Mathf.Abs(Mathf.Sin(s * 0.8f)) * 0.4f, 0); leftArm.localRotation = Quaternion.Euler(-70, 0, -20); rightArm.localRotation = Quaternion.Euler(-70, 0, 20); break;
                case "laugh": model.localRotation = Quaternion.Euler(Mathf.Sin(s * 2f) * 8f, 0, 0); break;
                case "wave": rightArm.localRotation = Quaternion.Euler(-25, 0, Mathf.Sin(s * 1.5f) * 45f); break;
                case "sad": model.localRotation = Quaternion.Euler(Mathf.Lerp(0, 25f, Mathf.Min(1, t * 2)), 0, 0); break;
            }
            yield return null;
        }
        model.localPosition = Vector3.zero; model.localRotation = Quaternion.identity;
        leftArm.localRotation = rightArm.localRotation = Quaternion.identity;
        leftLeg.localRotation = rightLeg.localRotation = Quaternion.identity;
        emote = null;
    }
}