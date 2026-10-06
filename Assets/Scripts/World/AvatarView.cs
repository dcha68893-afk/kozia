using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// Builds a character from the server-provided Look (appearance + equipped clothes) and level stage.
/// Procedural primitives so the project runs with zero art assets; swap BuildModel() for a
/// SkinnedMeshRenderer prefab pipeline when you have rigged human models.
public class AvatarView : MonoBehaviour
{
    public bool interpolate = true;
    Transform model;
    TextMesh label;
    Vector3 targetPos;
    float targetRy;
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
        string top = "#cccccc", bottom = "#555555", shoes = "#ffffff", acc = null;
        bool hasCrown = false, hasShades = false, hasHeadset = false;
        foreach (var e in look.equipped)
        {
            switch (e.category)
            {
                case "top": top = e.color ?? top; break;
                case "bottom": bottom = e.color ?? bottom; break;
                case "shoes": shoes = e.color ?? shoes; break;
                case "accessory":
                    acc = e.id;
                    hasCrown |= e.id == "acc_crown"; hasShades |= e.id == "acc_sunglasses"; hasHeadset |= e.id == "acc_headset";
                    break;
            }
        }

        bool skeleton = stage == "skeleton";
        if (skeleton) { skin = Hex("#e8e4d0"); top = "#e8e4d0"; bottom = "#d8d4c0"; shoes = "#d8d4c0"; hair = Hex("#e8e4d0"); }
        if (stage == "legendary") { top = "#d4af37"; }
        else if (stage == "elite") { hair = Color.Lerp(hair, Hex("#d4af37"), 0.5f); }

        float h = Mathf.Clamp(a.height, 0.85f, 1.15f);
        float b = Mathf.Clamp(a.build, 0.8f, 1.25f) * (skeleton ? 0.6f : 1f);

        model = new GameObject("Model").transform;
        model.SetParent(transform, false);
        model.localScale = new Vector3(1, h, 1);

        Part(PrimitiveType.Cylinder, new Vector3(0, 0.45f, 0), new Vector3(0.34f * b, 0.45f, 0.26f * b), Hex(bottom));       // legs
        Part(PrimitiveType.Cube, new Vector3(0, 0.05f, 0.06f), new Vector3(0.38f * b, 0.1f, 0.5f), Hex(shoes));              // shoes
        Part(PrimitiveType.Capsule, new Vector3(0, 1.2f, 0), new Vector3(0.5f * b, 0.38f, 0.3f * b), Hex(top));              // torso
        Part(PrimitiveType.Sphere, new Vector3(0, 1.78f, 0), Vector3.one * 0.34f, skin);                                     // head
        if (!skeleton) Part(PrimitiveType.Sphere, new Vector3(0, 1.78f, 0.045f), new Vector3(0.05f, 0.05f, 0.03f), Hex(a.eyes)); // eyes (marker)

        // hair styles: 0 bald, 1 short cap, 2 tall, 3 wide, 4 flat top, 5 long back
        switch (a.hairStyle)
        {
            case 1: Part(PrimitiveType.Sphere, new Vector3(0, 1.88f, -0.02f), new Vector3(0.36f, 0.22f, 0.36f), hair); break;
            case 2: Part(PrimitiveType.Sphere, new Vector3(0, 1.98f, 0), new Vector3(0.32f, 0.34f, 0.32f), hair); break;
            case 3: Part(PrimitiveType.Sphere, new Vector3(0, 1.84f, -0.02f), new Vector3(0.46f, 0.3f, 0.42f), hair); break;
            case 4: Part(PrimitiveType.Cylinder, new Vector3(0, 1.95f, 0), new Vector3(0.34f, 0.06f, 0.34f), hair); break;
            case 5: Part(PrimitiveType.Capsule, new Vector3(0, 1.7f, -0.14f), new Vector3(0.36f, 0.34f, 0.2f), hair); break;
        }
        if (hasShades) Part(PrimitiveType.Cube, new Vector3(0, 1.8f, 0.15f), new Vector3(0.3f, 0.06f, 0.05f), Color.black);
        if (hasHeadset) Part(PrimitiveType.Cylinder, new Vector3(0, 1.84f, 0), new Vector3(0.4f, 0.015f, 0.04f), Hex("#222222")).Rotate(0, 0, 90);
        if (hasCrown) Part(PrimitiveType.Cylinder, new Vector3(0, 2.05f, 0), new Vector3(0.26f, 0.05f, 0.26f), Hex("#d4af37"));

        var lgo = new GameObject("Label");
        lgo.transform.SetParent(transform, false);
        lgo.transform.localPosition = new Vector3(0, 2.4f * h, 0);
        label = lgo.AddComponent<TextMesh>();
        var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        label.font = font;
        lgo.GetComponent<MeshRenderer>().material = font.material;
        label.text = displayName;
        label.characterSize = 0.08f;
        label.fontSize = 48;
        label.anchor = TextAnchor.MiddleCenter;
        label.color = Color.white;
    }

    Transform Part(PrimitiveType type, Vector3 pos, Vector3 scale, Color color)
    {
        var go = GameObject.CreatePrimitive(type);
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(model, false);
        go.transform.localPosition = pos;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().material.color = color;
        return go.transform;
    }

    public void Snap(Vector3 pos, float ry)
    {
        transform.position = pos; targetPos = pos;
        transform.rotation = Quaternion.Euler(0, ry, 0); targetRy = ry;
    }

    public void SetTarget(Vector3 pos, float ry) { targetPos = pos; targetRy = ry; }

    void Update()
    {
        if (!interpolate) return;
        transform.position = Vector3.Lerp(transform.position, targetPos, Time.deltaTime * 12f);
        transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.Euler(0, targetRy, 0), Time.deltaTime * 12f);
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
                case "cheer": model.localPosition = new Vector3(0, Mathf.Abs(Mathf.Sin(s * 0.8f)) * 0.4f, 0); break;
                case "laugh": model.localRotation = Quaternion.Euler(Mathf.Sin(s * 2f) * 8f, 0, 0); break;
                case "wave": model.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(s * 1.5f) * 12f); break;
                case "sad": model.localRotation = Quaternion.Euler(Mathf.Lerp(0, 25f, Mathf.Min(1, t * 2)), 0, 0); break;
            }
            yield return null;
        }
        model.localPosition = Vector3.zero;
        model.localRotation = Quaternion.identity;
        emote = null;
    }
}
