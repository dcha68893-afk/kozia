using UnityEngine;

/// Moves the local avatar (WASD / arrows / left-bottom touch stick), follows with the camera,
/// and streams position to the server. The server validates speed and zone bounds.
public class LocalPlayer : MonoBehaviour
{
    public Camera cam;
    public AvatarView avatar;
    public TubeTable table;
    public float speed = 5f;
    public string zone = "lobby";

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
        if (GUIUtility.keyboardControl != 0) return Vector2.zero; // typing in a text field
        Vector2 v = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
        for (int i = 0; i < Input.touchCount; i++)
        {
            var t = Input.GetTouch(i);
            if (t.phase == TouchPhase.Began && touchId < 0 && t.position.x < Screen.width * 0.4f && t.position.y < Screen.height * 0.5f)
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
        if (move.sqrMagnitude > 0.01f)
        {
            transform.position += move.normalized * Mathf.Min(1f, move.magnitude) * speed * Time.deltaTime;
            avatar.transform.rotation = Quaternion.Slerp(avatar.transform.rotation, Quaternion.LookRotation(move), Time.deltaTime * 12f);
        }
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
            Vector3 want = transform.position + new Vector3(0, 6.5f, -8f);
            cam.transform.position = Vector3.Lerp(cam.transform.position, want, Time.deltaTime * 5f);
            cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, Quaternion.LookRotation(transform.position + Vector3.up * 1.5f - cam.transform.position), Time.deltaTime * 5f);
        }
    }
}
