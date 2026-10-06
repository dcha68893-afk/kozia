using UnityEngine;

/// Desktop + touch movement with server-authoritative position streaming and a smoother third-person camera.
public class LocalPlayer : MonoBehaviour
{
    public Camera cam;
    public AvatarView avatar;
    public TubeTable table;
    public float speed = 5f;
    public string zone = "lobby";
    public float cameraDistance = 8f;
    public float cameraHeight = 6.5f;
    public float cameraFollow = 7f;

    float sendAt;
    Vector3 lastSent;
    int touchId = -1;
    Vector2 touchOrigin;

    void Awake()
    {
        if (avatar == null)
        {
            var go = new GameObject("Avatar");
            go.transform.SetParent(transform, false);
            avatar = go.AddComponent<AvatarView>();
            avatar.interpolate = false;
        }
    }

    Vector2 ReadInput()
    {
        if (GUIUtility.keyboardControl != 0) return Vector2.zero;
        Vector2 v = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
        for (int i = 0; i < Input.touchCount; i++)
        {
            var t = Input.GetTouch(i);
            if (t.phase == TouchPhase.Began && touchId < 0 && t.position.x < Screen.width * 0.45f && t.position.y < Screen.height * 0.55f)
            { touchId = t.fingerId; touchOrigin = t.position; }
            if (t.fingerId == touchId)
            {
                if (t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled) touchId = -1;
                else v = Vector2.ClampMagnitude((t.position - touchOrigin) / (Screen.dpi > 0 ? Screen.dpi * 0.4f : 100f), 1f);
            }
        }
        return v;
    }

    public void Teleport(Vector3 p) { transform.position = p; lastSent = p; }

    void Update()
    {
        bool inRoom = table != null && table.InRoom;
        avatar.gameObject.SetActive(!inRoom);
        if (inRoom || Session.User == null) return;

        Vector2 input = ReadInput();
        Vector3 move = new Vector3(input.x, 0, input.y);
        bool moving = move.sqrMagnitude > 0.01f;
        if (moving)
        {
            move.Normalize();
            transform.position += move * speed * Time.deltaTime;
            avatar.transform.rotation = Quaternion.Slerp(avatar.transform.rotation, Quaternion.LookRotation(move), Time.deltaTime * 12f);
        }
        avatar.SetMotion(moving, moving ? Mathf.Clamp01(input.magnitude) : 0f);

        if (WorldClient.Centers.TryGetValue(zone, out var c))
        {
            Vector3 off = transform.position - c; off.y = 0;
            if (off.magnitude > WorldClient.ZoneRadius) transform.position = c + off.normalized * WorldClient.ZoneRadius;
        }

        if (Time.time >= sendAt && WsClient.I != null && WsClient.I.IsOpen)
        {
            bool moved = (transform.position - lastSent).sqrMagnitude > 0.0004f;
            if (moved || Time.time - sendAt > 1f)
            {
                WsClient.I.Send("world.move", new { x = transform.position.x, y = 0f, z = transform.position.z, ry = avatar.transform.eulerAngles.y, a = moved ? "walk" : "idle" });
                lastSent = transform.position;
            }
            sendAt = Time.time + 0.1f;
        }

        if (cam != null)
        {
            Vector3 want = transform.position - avatar.transform.forward * cameraDistance + Vector3.up * cameraHeight;
            cam.transform.position = Vector3.Lerp(cam.transform.position, want, Time.deltaTime * cameraFollow);
            Vector3 lookAt = transform.position + Vector3.up * 1.25f;
            cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, Quaternion.LookRotation(lookAt - cam.transform.position), Time.deltaTime * cameraFollow);
        }
    }
}