using System.Collections;
using UnityEngine;

/// Visual tube. Pure presentation: the server decides everything.
public class Tube : MonoBehaviour
{
    public int Slot;
    public float liftHeight = 0.8f;
    float baseY;

    public void Place(Vector3 p) { transform.position = p; baseY = p.y; }

    public IEnumerator Lift(float dur = 0.5f) { yield return MoveY(baseY + liftHeight, dur); }
    public IEnumerator Lower(float dur = 0.5f) { yield return MoveY(baseY, dur); }

    IEnumerator MoveY(float y, float dur)
    {
        Vector3 a = transform.position, b = new Vector3(a.x, y, a.z);
        for (float t = 0; t < 1f; t += Time.deltaTime / dur)
        {
            transform.position = Vector3.Lerp(a, b, Mathf.SmoothStep(0, 1, t));
            yield return null;
        }
        transform.position = b;
    }

    public IEnumerator MoveTo(Vector3 target, float dur, float arc)
    {
        Vector3 a = transform.position;
        for (float t = 0; t < 1f; t += Time.deltaTime / dur)
        {
            float e = Mathf.SmoothStep(0, 1, t);
            Vector3 p = Vector3.Lerp(a, target, e);
            p.z += Mathf.Sin(e * Mathf.PI) * arc;
            transform.position = p;
            yield return null;
        }
        transform.position = target;
    }
}
