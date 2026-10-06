using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// Runtime systems for the professional vertical slice. They are asset-agnostic so production
/// character/animation/audio assets can replace the procedural placeholders without rewriting gameplay.
public class NecpraWorldDirector : MonoBehaviour
{
    public string CurrentZone { get; private set; } = "lobby";
    readonly Dictionary<string, Vector3> centers = new Dictionary<string, Vector3>
    {
        {"lobby", new Vector3(0,0,0)}, {"restaurant", new Vector3(60,0,0)}, {"gamehall", new Vector3(120,0,0)}
    };

    void Awake()
    {
        Application.targetFrameRate = 60;
        QualitySettings.vSyncCount = 0;
    }

    public Vector3 ZoneCenter(string zone) => centers.TryGetValue(zone, out var p) ? p : centers["lobby"];
    public void SetZone(string zone) { if (centers.ContainsKey(zone)) CurrentZone = zone; }
}

public class HotelNpcDirector : MonoBehaviour
{
    class Npc
    {
        public Transform root;
        public Vector3 target;
        public float speed;
        public float phase;
    }

    public int receptionists = 1, waiters = 2, cleaners = 1, security = 1, entertainers = 1;
    readonly List<Npc> npcs = new List<Npc>();
    Material staff, shirt, dark, skin;

    void Start()
    {
        staff = Material("NPCStaff", new Color(.20f,.24f,.30f));
        shirt = Material("NPCShirt", new Color(.82f,.82f,.78f));
        dark = Material("NPCUniform", new Color(.06f,.07f,.09f));
        skin = Material("NPCSkin", new Color(.68f,.45f,.30f));
        SpawnGroup("Reception", receptionists, new Vector3(0,0,10), staff, 0.7f);
        SpawnGroup("Waiter", waiters, new Vector3(60,0,12), shirt, 1.15f);
        SpawnGroup("Cleaner", cleaners, new Vector3(55,0,-12), staff, 0.9f);
        SpawnGroup("Security", security, new Vector3(120,0,20), dark, 0.75f);
        SpawnGroup("Entertainer", entertainers, new Vector3(120,0,-18), shirt, 1.0f);
    }

    Material Material(string n, Color c)
    {
        var m = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"));
        m.name=n; m.color=c; return m;
    }

    void SpawnGroup(string role, int count, Vector3 origin, Material clothes, float speed)
    {
        for(int i=0;i<count;i++)
        {
            var root=new GameObject("NPC_"+role+"_"+i).transform;
            root.position=origin+new Vector3(i*1.6f,0,0);
            BuildBody(root, clothes);
            npcs.Add(new Npc{root=root,target=root.position,speed=speed,phase=i*.8f});
        }
    }

    void BuildBody(Transform root, Material clothes)
    {
        Part(root, PrimitiveType.Capsule, new Vector3(0,1.15f,0), new Vector3(.42f,.48f,.28f), clothes);
        Part(root, PrimitiveType.Cylinder, new Vector3(0,.55f,0), new Vector3(.27f,.45f,.27f), dark);
        Part(root, PrimitiveType.Sphere, new Vector3(0,1.85f,0), Vector3.one*.31f, skin);
        Part(root, PrimitiveType.Capsule, new Vector3(-.38f,1.12f,0), new Vector3(.10f,.32f,.10f), skin);
        Part(root, PrimitiveType.Capsule, new Vector3(.38f,1.12f,0), new Vector3(.10f,.32f,.10f), skin);
    }

    void Part(Transform p, PrimitiveType t, Vector3 pos, Vector3 scale, Material mat)
    {
        var g=GameObject.CreatePrimitive(t); Destroy(g.GetComponent<Collider>());
        g.transform.SetParent(p,false); g.transform.localPosition=pos; g.transform.localScale=scale; g.GetComponent<Renderer>().sharedMaterial=mat;
    }

    void Update()
    {
        for(int i=0;i<npcs.Count;i++)
        {
            var n=npcs[i];
            if(Vector3.Distance(n.root.position,n.target)<.5f)
            {
                float a=Time.time*.17f+n.phase;
                n.target=n.root.position+new Vector3(Mathf.Sin(a)*5f,0,Mathf.Cos(a)*5f);
            }
            Vector3 d=n.target-n.root.position; d.y=0;
            if(d.sqrMagnitude>.01f)
            {
                n.root.position=Vector3.MoveTowards(n.root.position,n.target,n.speed*Time.deltaTime);
                n.root.rotation=Quaternion.Slerp(n.root.rotation,Quaternion.LookRotation(d),Time.deltaTime*7f);
            }
        }
    }
}

public class NecpraCinematicCamera : MonoBehaviour
{
    public Camera targetCamera;
    public Transform lobby, table, close;
    public float smooth=7f;
    public enum Mode { Follow, Wide, Table, Close, Spectator }
    public Mode mode=Mode.Follow;

    void LateUpdate()
    {
        if(targetCamera==null) targetCamera=Camera.main;
        if(targetCamera==null) return;
        Transform t=mode==Mode.Close?close:(mode==Mode.Table?table:(mode==Mode.Wide?lobby:null));
        if(t!=null)
        {
            targetCamera.transform.position=Vector3.Lerp(targetCamera.transform.position,t.position,Time.deltaTime*smooth);
            targetCamera.transform.rotation=Quaternion.Slerp(targetCamera.transform.rotation,t.rotation,Time.deltaTime*smooth);
        }
    }
}

public class NecpraGraphicsSettings : MonoBehaviour
{
    public enum Preset { Low, Medium, High, Ultra }
    public Preset preset=Preset.High;

    void Start(){ Apply(preset); }

    public void Apply(Preset p)
    {
        preset=p;
        int level=p==Preset.Low?0:p==Preset.Medium?1:p==Preset.High?2:3;
        if(QualitySettings.names.Length>level) QualitySettings.SetQualityLevel(level,true);
        QualitySettings.shadowDistance=p==Preset.Low?25:p==Preset.Medium?50:p==Preset.High?80:120;
        QualitySettings.lodBias=p==Preset.Low?.7f:p==Preset.Medium?1f:p==Preset.High?1.5f:2f;
        Application.targetFrameRate=p==Preset.Low?30:60;
    }
}

public class NecpraAudioDirector : MonoBehaviour
{
    AudioSource source;
    AudioClip click;
    float nextAmbient;

    void Awake()
    {
        source=gameObject.AddComponent<AudioSource>();
        source.playOnAwake=false; source.spatialBlend=0f; source.volume=.18f;
        click=Tone(700,.055f);
    }

    AudioClip Tone(float hz,float seconds)
    {
        int rate=44100, count=Mathf.Max(1,(int)(rate*seconds));
        var clip=AudioClip.Create("ui_tone",count,1,rate,false);
        var data=new float[count];
        for(int i=0;i<count;i++) data[i]=Mathf.Sin(2*Mathf.PI*hz*i/rate)*Mathf.Exp(-8f*i/(float)count);
        clip.SetData(data,0); return clip;
    }

    public void Click(){ if(source && click) source.PlayOneShot(click); }

    void Update()
    {
        if(Time.time>nextAmbient){ nextAmbient=Time.time+20f; }
    }
}

public class NecpraMiniGameCatalog : MonoBehaviour
{
    public enum GameMode { TubeChallenge, WaterSort, BlockPuzzle, Trivers, Crossword, Chess, Reaction, Memory, Racing, TeamStrategy }

    public static readonly string[] Names =
    {"Tube Challenge","Water Sort","Block Puzzle","Trivers","Crossword","Chess","Reaction","Memory","Racing","Team Strategy"};

    public static bool IsCompetitive(GameMode mode) => true;
}
