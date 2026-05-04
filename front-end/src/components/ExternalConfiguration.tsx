import { useState, useEffect } from "react";

interface ConnectionConfigProps {
  user_id: string;
}

export default function ConnectionConfigForm({ user_id } : ConnectionConfigProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    type: "",
    connectionString: "",
    poll: false,
  });

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleToggle = () => {
    if (isEditing) {
      // Save logic here
      console.log("Saved:", formData);
      updateUser();
    }
    setIsEditing((prev) => !prev);
  };

  const updateUser = () => {
    fetch(`http://127.0.0.1:8000/healthkit/${user_id}/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        "connection_type": formData["type"],
        "connection_string": formData["connectionString"],
        "connection_poll": formData["poll"]
      }),
    }).then((res) => {
      // TODO idk add something here to check the success
    })
  };

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/healthkit/${user_id}/config`).then((res) => {
      if (!res.ok) {
          throw new Error("Failed to fetch user config");
        }
        return res.json();
    }).then((data) => {
      let state: any = {};
      if ("connection_type" in data) {
        state["type"] = data["connection_type"];
      } else {
        state["type"] = "";
      }

      if ("connection_string" in data) {
        state["connectionString"] = data["connection_string"];
      } else {
        state["connectionString"] = "";
      }

      if ("connection_poll" in data) {
        state["poll"] = data["connection_poll"];
      } else {
        state["poll"] = false;
      }

      setFormData(state);

    }).catch((err) => {
      console.error("Failed to retrieve user config", err);
    })
  }, []);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-gray-800 text-sm mb-1">Connection Configuration</h3>
        <p className="text-xs text-gray-400">Configure external data connection settings</p>
      </div>

      <div className="flex flex-col gap-3">
        {/* Type */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Type</label>
          <select
            name="type"
            value={formData.type}
            onChange={handleChange}
            disabled={!isEditing}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          >
            <option value="">None</option>
            <option value="File">Demo (File)</option>
            <option value="Stream">Demo (Stream)</option>
            <option value="HealthKit">Healthkit (WIP)</option>
          </select>
        </div>

        {/* Connection String */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Connection String</label>
          <input
            type="text"
            name="connectionString"
            value={formData.connectionString}
            onChange={handleChange}
            disabled={!isEditing}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          />
        </div>

        {/* Poll */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="poll"
            checked={formData.poll}
            onChange={handleChange}
            disabled={!isEditing}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          />
          <label className="text-xs text-gray-500">Enable Polling</label>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleToggle}
          className="mt-1 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          {isEditing ? "Save" : "Edit"}
        </button>
      </div>
    </div>
  );
}
