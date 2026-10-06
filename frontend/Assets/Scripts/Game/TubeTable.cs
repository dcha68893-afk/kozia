using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

public class TubeTable : MonoBehaviour
{
    public Tube[] tubes;
    public Transform[] slotPoints;
    public Transform ball;
    public Transform[] seats;
    public Transform tableCam, closeCam;
    public Camera cam;
    public WorldClient world;

    public RoomSnapshot Room;
    public bool InRoom => Room != null;
    public string Phase = "lobby";
    public int Round, TotalRounds;
    public bool Picked;
    public string Banner = "";
    public readonly List<string> Log = new List<string>();
    public float SecondsLeft => Mathf.Max(0f, phaseEnds - Time.time);

    float phaseEnds;
    Tube[] atSlot;
    Coroutine anim;
    readonly Dictionary<string, AvatarView> seated = new Dictionary<string, AvatarView>();

    void Start()
    {
        atSlot = new Tube[tubes.Length];
        ResetTubes();
        ball.gameObject.SetActive(false);
        var ws = WsClient.I;
        ws.On("room.update", d => OnRoomUpdate(d.ToObject<RoomSnapshot>()));
        ws.On("room.left", _ => LeaveLocal());
        ws.On("tube.aborted", d => { Banner = "Match aborted: " + (string)d["reason"]; Phase = "lobby"; });
        ws.On("tube.prepare", d =>
        {
            Round = (int)d["round"]; TotalRounds = (int)d["totalRounds"]; Picked = false;
            Phase = "prepare"; phaseEnds = Time.time + (float)d["ms"] / 1000f;
            Banner = "Round " + Round + "/" + TotalRounds + ": watch the ball!";
            Play(PrepareAnim((int)d["ballSlot"]));
        });
        ws.On("tube.observe", d => { Phase = "observe"; phaseEnds = Time.time + (float)d["ms"] / 1000f; Banner = "Get ready..."; });
        ws.On("tube.shuffle", d =>
        {
            Phase = "shuffle"; Banner = "Follow the ball!";
            Play(ShuffleAnim(d["swaps"].ToObject<List<int[]>>(), (float)d["swapMs"] / 1000f));
        });
        ws.On("tube.select", d => { Phase = "select"; Picked = false; phaseEnds = Time.time + (float)d["ms"] / 1000f; Banner = "Tap the tube with the ball!"; });
        ws.On("tube.reveal", d =>
        {
            Phase = "reveal"; phaseEnds = Time.time + (float)d["ms"] / 1000f; Banner = "Reveal!";
            var results = d["results"].ToObject<List<PickResult>>();
            foreach (var r in results)
            {
                Log.Add(r.username + (r.correct ? " found it (+" + r.coins + " coins)" : " missed"));
                if (seated.TryGetValue(r.userId, out var av)) av.PlayEmote(r.correct ? "cheer" : "sad");
            }
            if (Log.Count > 12) Log.RemoveRange(0, Log.Count - 12);
            Play(RevealAnim((int)d["ballSlot"]));
        });
        ws.On("tube.end", d =>
        {
            Phase = "finished";
            var st = d["standings"] as JArray;
            Banner = st != null && st.Count > 0 ? "Winner: " + (string)st[0]["username"] : "Match over";
            _ = ReloadUser();
        });
        ws.On("tube.picked", _ => { });
    }

    async System.Threading.Tasks.Task ReloadUser() { try { await ApiClient.Me(); } catch { } }

    void OnRoomUpdate(RoomSnapshot snap)
    {
        bool entering = Room == null;
        Room = snap; Phase = snap.phase; Round = snap.round; TotalRounds = snap.totalRounds;
        world.InGameRoom = true;
        if (entering) { Log.Clear(); Banner = "Waiting for host to start"; ResetTubes(); }
        SyncSeats();
        if (snap.phase == "lobby") { Picked = false; Banner = "Waiting for host to start"; ResetTubes(); }
    }

    void LeaveLocal()
    {
        Room = null; Phase = "lobby"; world.InGameRoom = false;
        foreach (var kv in seated) if (kv.Value) Destroy(kv.Value.gameObject);
        seated.Clear();
        ball.gameObject.SetActive(false);
        world.Join("gamehall");
    }

    void SyncSeats()
    {
        var present = new HashSet<string>();
        int i = 0;
        foreach (var m in Room.members)
        {
            if (m.spectator) continue;
            present.Add(m.userId);
            if (!seated.ContainsKey(m.userId))
            {
                var av = new GameObject("Seat_" + m.username).AddComponent<AvatarView>();
                av.Build(m.username, m.look, m.stage);
                av.Snap(seats[Mathf.Min(i, seats.Length - 1)].position, 180);
                seated[m.userId] = av;
            }
            i++;
        }
        foreach (var kv in new Dictionary<string, AvatarView>(seated))
            if (!present.Contains(kv.Key)) { if (kv.Value) Destroy(kv.Value.gameObject); seated.Remove(kv.Key); }
    }

    void ResetTubes()
    {
        if (atSlot == null) atSlot = new Tube[tubes.Length];
        for (int i = 0; i < tubes.Length; i++) { atSlot[i] = tubes[i]; tubes[i].Slot = i; tubes[i].Place(slotPoints[i].position); }
    }

    void Play(IEnumerator r) { if (anim != null) StopCoroutine(anim); anim = StartCoroutine(r); }

    IEnumerator PrepareAnim(int ballSlot)
    {
        ResetTubes();
        ball.position = slotPoints[ballSlot].position + Vector3.down * 0.35f;
        ball.gameObject.SetActive(true);
        yield return atSlot[ballSlot].Lift(0.45f);
        yield return new WaitForSeconds(1.0f);
        yield return atSlot[ballSlot].Lower(0.4f);
        ball.gameObject.SetActive(false);
    }

    IEnumerator ShuffleAnim(List<int[]> swaps, float swapSec)
    {
        ball.gameObject.SetActive(false);
        foreach (var s in swaps)
        {
            Tube ta = atSlot[s[0]], tb = atSlot[s[1]];
            var c1 = StartCoroutine(ta.MoveTo(slotPoints[s[1]].position, swapSec * 0.9f, 0.35f));
            var c2 = StartCoroutine(tb.MoveTo(slotPoints[s[0]].position, swapSec * 0.9f, -0.35f));
            yield return c1; yield return c2;
            atSlot[s[0]] = tb; atSlot[s[1]] = ta; tb.Slot = s[0]; ta.Slot = s[1];
            yield return new WaitForSeconds(swapSec * 0.1f);
        }
    }

    IEnumerator RevealAnim(int ballSlot)
    {
        ball.position = slotPoints[ballSlot].position + Vector3.down * 0.3f;
        ball.gameObject.SetActive(true);
        yield return atSlot[ballSlot].Lift(0.7f);
        yield return new WaitForSeconds(2f);
        yield return atSlot[ballSlot].Lower(0.5f);
        ball.gameObject.SetActive(false);
    }

    public void Pick(int slot)
    {
        if (Phase != "select" || Picked || slot < 0 || slot >= tubes.Length) return;
        Picked = true;
        WsClient.I.Send("room.pick", new { slot });
    }

    void Update()
    {
        if (!InRoom || cam == null) return;
        Transform target = Phase == "reveal" ? closeCam : tableCam;
        cam.transform.position = Vector3.Lerp(cam.transform.position, target.position, Time.deltaTime * 2.5f);
        cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, target.rotation, Time.deltaTime * 2.5f);
        if (Phase == "select" && !Picked)
        {
            bool down = Input.GetMouseButtonDown(0) || (Input.touchCount > 0 && Input.GetTouch(0).phase == TouchPhase.Began);
            if (down)
            {
                Vector3 pos = Input.touchCount > 0 ? (Vector3)Input.GetTouch(0).position : Input.mousePosition;
                if (Physics.Raycast(cam.ScreenPointToRay(pos), out var hit))
                {
                    var t = hit.collider.GetComponentInParent<Tube>();
                    if (t != null) Pick(t.Slot);
                }
            }
        }
    }
}