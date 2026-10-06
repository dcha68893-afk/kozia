using System;
using System.Collections.Generic;
using UnityEngine;

/// Asset-free playable mini-game runtime used by the Game Hall while production art is added.
/// Includes Water Sort, Block Puzzle, Reaction and Memory. Scores are local until a server
/// authoritative match adapter is selected for the mode.
public class NecpraMiniGameRuntime : MonoBehaviour
{
    public enum Mode { None, WaterSort, BlockPuzzle, Reaction, Memory }
    public Mode mode = Mode.None;
    public bool Opened => mode != Mode.None;

    readonly System.Random rng = new System.Random();
    int score, moves, best;
    float startedAt, reactionAt;
    bool reactionReady, reactionGo, reactionFinished;
    string status = "";
    Vector2 scroll;

    // Water Sort
    readonly List<List<int>> water = new List<List<int>>();
    int selectedTube = -1;

    // Block Puzzle
    readonly bool[,] board = new bool[8,8];
    readonly List<Vector2Int> block = new List<Vector2Int>();
    bool draggingBlock;

    // Memory
    readonly List<int> memory = new List<int>();
    readonly HashSet<int> revealed = new HashSet<int>();
    int firstCard = -1, matched;
    float hideAt;

    public void Open(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return;
        if (Enum.TryParse(name, true, out Mode m)) Open(m);
    }

    public void Open(Mode m)
    {
        mode = m;
        Reset();
    }

    public void Close() { mode = Mode.None; }

    void Reset()
    {
        score = 0; moves = 0; best = 0; startedAt = Time.time;
        status = ""; selectedTube = -1; reactionReady = reactionGo = reactionFinished = false;
        draggingBlock = false; revealed.Clear(); firstCard = -1; matched = 0;
        water.Clear(); Array.Clear(board, 0, board.Length); block.Clear(); memory.Clear();
        if (mode == Mode.WaterSort) SetupWater();
        if (mode == Mode.BlockPuzzle) SetupBlock();
        if (mode == Mode.Reaction) SetupReaction();
        if (mode == Mode.Memory) SetupMemory();
    }

    void SetupWater()
    {
        const int colors = 4, filled = 4;
        var pool = new List<int>();
        for (int c=0;c<colors;c++) for (int i=0;i<filled;i++) pool.Add(c);
        for (int i=pool.Count-1;i>0;i--) { int j=rng.Next(i+1); (pool[i],pool[j])=(pool[j],pool[i]); }
        for (int t=0;t<colors+2;t++) water.Add(new List<int>());
        for (int i=0;i<pool.Count;i++) water[i/4].Add(pool[i]);
        status = "Sort every colour into a single tube.";
    }

    bool WaterSolved()
    {
        foreach (var t in water)
        {
            if (t.Count == 0) continue;
            if (t.Count != 4) return false;
            for (int i=1;i<t.Count;i++) if (t[i] != t[0]) return false;
        }
        return true;
    }

    void WaterTap(int index)
    {
        if (index < 0 || index >= water.Count) return;
        if (selectedTube < 0)
        {
            if (water[index].Count > 0) selectedTube = index;
            return;
        }
        if (selectedTube == index) { selectedTube = -1; return; }
        var from = water[selectedTube]; var to = water[index];
        if (from.Count == 0 || to.Count >= 4) { selectedTube = -1; return; }
        int color = from[from.Count-1];
        if (to.Count > 0 && to[to.Count-1] != color) { selectedTube = -1; return; }
        int run = 1;
        for (int i=from.Count-2;i>=0 && from[i]==color;i--) run++;
        int amount = Mathf.Min(run, 4-to.Count);
        for (int i=0;i<amount;i++) { from.RemoveAt(from.Count-1); to.Add(color); }
        moves++; score += amount * 10; selectedTube = -1;
        if (WaterSolved()) status = "Solved! +" + score + " points";
    }

    void SetupBlock()
    {
        SpawnBlock();
        status = "Place the shape. Full rows and columns clear.";
    }

    void SpawnBlock()
    {
        block.Clear();
        int shape = rng.Next(5);
        if (shape == 0) { block.Add(new Vector2Int(0,0)); block.Add(new Vector2Int(1,0)); block.Add(new Vector2Int(0,1)); block.Add(new Vector2Int(1,1)); }
        else if (shape == 1) for (int i=0;i<3;i++) block.Add(new Vector2Int(i,0));
        else if (shape == 2) { block.Add(new Vector2Int(0,0)); block.Add(new Vector2Int(0,1)); block.Add(new Vector2Int(1,1)); }
        else if (shape == 3) { block.Add(new Vector2Int(0,0)); block.Add(new Vector2Int(1,0)); block.Add(new Vector2Int(2,0)); block.Add(new Vector2Int(1,1)); }
        else { block.Add(new Vector2Int(0,0)); block.Add(new Vector2Int(0,1)); block.Add(new Vector2Int(0,2)); }
    }

    bool CanPlace(int ox,int oy)
    {
        foreach (var p in block) { int x=ox+p.x,y=oy+p.y; if(x<0||x>=8||y<0||y>=8||board[x,y]) return false; }
        return true;
    }

    void PlaceBlock(int ox,int oy)
    {
        if (!CanPlace(ox,oy)) { status="That shape does not fit."; return; }
        foreach(var p in block) board[ox+p.x,oy+p.y]=true;
        moves++; score += block.Count * 5;
        int cleared=0;
        for(int y=0;y<8;y++){bool full=true;for(int x=0;x<8;x++)if(!board[x,y]){full=false;break;}if(full){for(int x=0;x<8;x++)board[x,y]=false;cleared++;}}
        for(int x=0;x<8;x++){bool full=true;for(int y=0;y<8;y++)if(!board[x,y]){full=false;break;}if(full){for(int y=0;y<8;y++)board[x,y]=false;cleared++;}}
        score += cleared*100;
        SpawnBlock();
        status = cleared > 0 ? "Great! Cleared " + cleared + " line(s)." : "Shape placed.";
    }

    void SetupReaction()
    {
        reactionAt = Time.time + UnityEngine.Random.Range(1.2f,3.5f);
        status = "Wait for GO...";
    }

    void SetupMemory()
    {
        for(int i=0;i<8;i++){memory.Add(i);memory.Add(i);}
        for(int i=memory.Count-1;i>0;i--){int j=rng.Next(i+1);(memory[i],memory[j])=(memory[j],memory[i]);}
        status = "Find all matching pairs.";
    }

    void MemoryTap(int i)
    {
        if (revealed.Contains(i) || Time.time < hideAt) return;
        revealed.Add(i);
        if (firstCard < 0) { firstCard=i; return; }
        moves++;
        if (memory[firstCard] == memory[i]) { matched++; score += 100; firstCard=-1; }
        else { score += 5; hideAt=Time.time+0.7f; }
        if(matched==8) status="Memory complete! +" + score + " points";
    }

    void Update()
    {
        if (mode == Mode.Reaction && !reactionFinished && !reactionGo && Time.time >= reactionAt)
        { reactionReady=true; reactionGo=true; status="GO! CLICK NOW"; }
        if (mode == Mode.Memory && hideAt > 0 && Time.time >= hideAt)
        { if(firstCard>=0 && revealed.Count>0){ var temp=new List<int>(revealed); foreach(int i in temp) if(i!=firstCard && memory[i]!=memory[firstCard]) revealed.Remove(i); } hideAt=0; firstCard=-1; }
    }

    void OnGUI()
    {
        if (!Opened) return;
        float s=Mathf.Max(1f,Screen.height/720f); GUI.matrix=Matrix4x4.Scale(new Vector3(s,s,1));
        float w=Screen.width/s,h=Screen.height/s;
        GUI.Box(new Rect(30,30,w-60,h-60), GUI.skin.box);
        GUILayout.BeginArea(new Rect(55,50,w-110,h-100));
        GUILayout.BeginHorizontal();
        GUILayout.Label("<b>NECPRA GAME LAB • "+mode.ToString().ToUpper()+"</b>");
        GUILayout.FlexibleSpace();
        if(GUILayout.Button("EXIT",GUILayout.Width(70))) Close();
        GUILayout.EndHorizontal();
        GUILayout.Label("Score "+score+"   Moves "+moves+"   "+status);
        scroll=GUILayout.BeginScrollView(scroll);
        if(mode==Mode.WaterSort) DrawWater();
        else if(mode==Mode.BlockPuzzle) DrawBlock();
        else if(mode==Mode.Reaction) DrawReaction();
        else if(mode==Mode.Memory) DrawMemory();
        GUILayout.EndScrollView();
        GUILayout.EndArea();
    }

    void DrawWater()
    {
        GUILayout.Label("Tap a source tube, then a destination tube.");
        GUILayout.BeginHorizontal();
        for(int i=0;i<water.Count;i++){
            GUILayout.BeginVertical(GUILayout.Width(80));
            string text="";
            for(int j=0;j<water[i].Count;j++) text += "■ ";
            GUI.enabled=selectedTube!=i;
            if(GUILayout.Button("Tube "+(i+1)+"\n"+text,GUILayout.Height(100))) WaterTap(i);
            GUI.enabled=true; GUILayout.EndVertical();
        }
        GUILayout.EndHorizontal();
        if(WaterSolved() && GUILayout.Button("PLAY AGAIN",GUILayout.Height(40))) Reset();
    }

    void DrawBlock()
    {
        GUILayout.Label("Tap a board cell to place the current shape.");
        for(int y=7;y>=0;y--){GUILayout.BeginHorizontal();for(int x=0;x<8;x++){bool filled=board[x,y];string t=filled?"■":"";if(!filled&&block.Count>0&&CanPlace(x,y))t="+";if(GUILayout.Button(t,GUILayout.Width(42),GUILayout.Height(42))&&!filled)PlaceBlock(x,y); }GUILayout.EndHorizontal();}
        GUILayout.Label("Current shape: "+block.Count+" blocks");
        GUILayout.BeginHorizontal();foreach(var p in block)GUILayout.Label("■",GUILayout.Width(25));GUILayout.EndHorizontal();
    }

    void DrawReaction()
    {
        GUILayout.Label(reactionReady ? "GO!" : "Do not click until GO appears.");
        if(!reactionFinished && GUILayout.Button(reactionReady?"CLICK!":"WAIT",GUILayout.Height(180)))
        {
            if(!reactionReady){status="Too early!"; reactionFinished=true; score=0;}
            else {float ms=(Time.time-reactionAt)*1000f; score=Mathf.Max(1,Mathf.RoundToInt(1000-ms)); status="Reaction: "+ms.ToString("0")+" ms"; reactionFinished=true;}
        }
        if(reactionFinished && GUILayout.Button("PLAY AGAIN",GUILayout.Height(40))) Reset();
    }

    void DrawMemory()
    {
        for(int y=0;y<4;y++){GUILayout.BeginHorizontal();for(int x=0;x<4;x++){int i=y*4+x;bool show=revealed.Contains(i)||i==firstCard;string label=show?memory[i].ToString():"?";if(GUILayout.Button(label,GUILayout.Width(70),GUILayout.Height(70)))MemoryTap(i);}GUILayout.EndHorizontal();}
        if(matched==8 && GUILayout.Button("PLAY AGAIN",GUILayout.Height(40))) Reset();
    }
}
